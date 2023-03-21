import { IHttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { AssetOptions } from "aws-cdk-lib";
import { CfnApi } from "aws-cdk-lib/aws-apigatewayv2";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import {
  ASSET_RESOURCE_METADATA_ENABLED_CONTEXT,
  ASSET_RESOURCE_METADATA_PATH_KEY,
  ASSET_RESOURCE_METADATA_PROPERTY_KEY,
} from "aws-cdk-lib/cx-api";
import { Construct, Node } from "constructs";

/**
 * Represents an OpenAPI definition asset.
 */
export abstract class ApiDefinition {
  /**
   * Creates an API definition from a specification file in an S3 bucket
   */
  public static fromBucket(
    bucket: IBucket,
    key: string,
    objectVersion?: string
  ): S3ApiDefinition {
    return new S3ApiDefinition(bucket, key, objectVersion);
  }

  /**
   * Create an API definition from an inline object. The inline object must follow the
   * schema of OpenAPI 2.0 or OpenAPI 3.0
   */
  public static fromInline(definition: any): InlineApiDefinition {
    return new InlineApiDefinition(definition);
  }

  /**
   * Loads the API specification from a local disk asset.
   */
  public static fromAsset(
    file: string,
    options?: AssetOptions
  ): AssetApiDefinition {
    return new AssetApiDefinition(file, options);
  }

  /**
   * Called when the specification is initialized to allow this object to bind
   * to the stack, add resources and have fun.
   *
   * @param scope The binding scope. You may just use it as a construct scope.
   */
  public abstract bind(scope: Construct): ApiDefinitionConfig;

  /**
   * Called after the CFN resource has been created to allow the Api
   * Definition to bind to it. Specifically it's required to allow assets to add
   * metadata for tooling like SAM CLI to be able to find their origins.
   */
  public bindAfterCreate(_scope: Construct, _httpApi: IHttpApi) {
    return;
  }
}

/**
 * S3 location of the API definition file
 */
export interface ApiDefinitionS3Location {
  /** The S3 bucket */
  readonly bucket: string;
  /** The S3 key */
  readonly key: string;
  /**
   * The S3 object version
   *
   * @default - latest version
   */
  readonly version?: string;
}

/**
 * Post-Binding Configuration for a CDK construct
 */
export interface ApiDefinitionConfig {
  /**
   * The location of the specification in S3 (mutually exclusive with `inlineDefinition`).
   *
   * @default - API definition is not an S3 location
   */
  readonly s3Location?: ApiDefinitionS3Location;

  /**
   * Inline specification (mutually exclusive with `s3Location`).
   *
   * @default - API definition is not defined inline
   */
  readonly inlineDefinition?: any;
}

/**
 * OpenAPI specification from an S3 archive.
 */
export class S3ApiDefinition extends ApiDefinition {
  private bucketName: string;

  constructor(
    bucket: IBucket,
    private key: string,
    private objectVersion?: string
  ) {
    super();

    this.bucketName = bucket.bucketName;
  }

  public bind(_scope: Construct): ApiDefinitionConfig {
    return {
      s3Location: {
        bucket: this.bucketName,
        key: this.key,
        version: this.objectVersion,
      },
    };
  }
}

/**
 * OpenAPI specification from an inline JSON object.
 */
export class InlineApiDefinition extends ApiDefinition {
  /**
   *
   * @param definition An object based on the OpenAPI specification.
   */
  constructor(private definition: object) {
    super();
  }

  public bind(_scope: Construct): ApiDefinitionConfig {
    return {
      inlineDefinition: this.definition,
    };
  }
}

/**
 * OpenAPI specification from a local file.
 */
export class AssetApiDefinition extends ApiDefinition {
  private asset?: Asset;

  constructor(
    private readonly path: string,
    private readonly options: AssetOptions = {}
  ) {
    super();
  }

  public bind(scope: Construct): ApiDefinitionConfig {
    // If the same AssetAPIDefinition is used multiple times, retain only the first instantiation.
    if (this.asset === undefined) {
      this.asset = new Asset(scope, "APIDefinition", {
        path: this.path,
        ...this.options,
      });
    }

    if (this.asset.isZipArchive) {
      throw new Error(
        `Asset cannot be a .zip file or a directory (${this.path})`
      );
    }

    return {
      s3Location: {
        bucket: this.asset.s3BucketName,
        key: this.asset.s3ObjectKey,
      },
    };
  }

  public bindAfterCreate(scope: Construct, httpApi: IHttpApi) {
    if (!scope.node.tryGetContext(ASSET_RESOURCE_METADATA_ENABLED_CONTEXT)) {
      return; // not enabled
    }

    if (!this.asset) {
      throw new Error("bindAfterCreate() must be called after bind()");
    }

    const child = Node.of(httpApi).defaultChild as CfnApi;
    child.addMetadata(ASSET_RESOURCE_METADATA_PATH_KEY, this.asset.assetPath);
    child.addMetadata(ASSET_RESOURCE_METADATA_PROPERTY_KEY, "BodyS3Location");
  }
}
