import * as aws_kms from "aws-cdk-lib/aws-kms";
import * as aws_opensearchserverless from "aws-cdk-lib/aws-opensearchserverless";
import { RemovalPolicy, Resource } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { Access, DataAccessPolicy } from "./data-access-policy";
import { SearchPrincipal } from "./search-service";

export interface ICollection {
  readonly collectionName: string;
  readonly collectionId: string;
  readonly collectionArn: string;
  readonly collectionEndpoint: string;
  readonly collectionDashboardEndpoint: string;
  readonly encryptionKey?: aws_kms.IKey;
}

/**
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-collection.html#cfn-opensearchserverless-collection-type
 */
export enum CollectionType {
  SEARCH = "SEARCH",
  TIME_SERIES = "TIMESERIES",
}

export interface CollectionProps {
  /**
   * Physical Name of the {@link Collection}.
   */
  collectionName: string;
  /**
   * Optional description of the {@link Collection}.
   */
  description?: string;
  /**
   * @default {@link CollectionType.SEARCH}
   *
   * @see https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-overview.html#serverless-usecase
   */
  type?: CollectionType;
  /**
   * The KMS key used to encrypt all indexes within this {@link Collection}.
   *
   * @default - one is created for you
   */
  encryptionKey?: aws_kms.IKey;
  /**
   * Enables public internet access to this {@link Collection} via a Network Policy
   *
   * @default true
   * @see https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-network.html
   */
  allowFromPublic?: boolean;
  /**
   * List of VPCEs, e.g. `vpce-050f79086ee71ac05`, that have access to this Collection.
   */
  sourceVPCEs?: string[];

  removalPolicy?: RemovalPolicy;
}

/**
 *
 */
export class Collection extends Resource implements ICollection {
  public readonly resource;
  public readonly collectionName;
  public readonly collectionId;
  public readonly collectionArn;
  public readonly collectionEndpoint;
  public readonly collectionDashboardEndpoint;
  public readonly encryptionKey;
  public readonly accessPolicy: DataAccessPolicy;

  constructor(scope: Construct, id: string, props: CollectionProps) {
    super(scope, id, {
      physicalName: props.collectionName,
    });

    this.resource = new aws_opensearchserverless.CfnCollection(
      this,
      "Resource",
      {
        name: props.collectionName,
        description: props.description,
        type: props.type ?? CollectionType.SEARCH,
      }
    );

    this.collectionName = props.collectionName;
    this.collectionId = this.resource.attrId;
    this.collectionArn = this.resource.attrArn;
    this.collectionEndpoint = this.resource.attrCollectionEndpoint;
    this.collectionDashboardEndpoint = this.resource.attrDashboardEndpoint;

    this.encryptionKey = props.encryptionKey;

    // encryption policy
    new aws_opensearchserverless.CfnSecurityPolicy(this, "EncryptionPolicy", {
      name: props.collectionName,
      type: "encryption",
      policy: JSON.stringify({
        AWSOwnedKey: this.encryptionKey?.keyArn === undefined,
        Rules: [
          {
            Resource: [this.collectionArn],
            ResourceType: "collection",
          },
        ],
        KmsARN: this.encryptionKey?.keyArn,
      } satisfies SecurityPolicy),
    });

    // network access policy - for now we just grant public access to avoid VPC nonsense
    // TODO: we should really consider looking into VPCs soon
    new aws_opensearchserverless.CfnSecurityPolicy(this, "NetworkPolicy", {
      name: props.collectionName,
      type: "network",
      policy: JSON.stringify({
        Rules: [
          {
            Resource: [this.collectionArn],
            ResourceType: "collection",
          },
        ],
        AllowFromPublic: true,
      } satisfies NetworkPolicy),
    });

    this.accessPolicy = new DataAccessPolicy(this, "AccessPolicy", {
      collection: this,
      accessPolicyName: this.collectionName,
    });
  }

  public grantControl(principal: SearchPrincipal) {
    this.grant(principal, {
      access: Access.Control,
    });
  }

  public grantReadWrite(
    principal: SearchPrincipal,
    options?: {
      indexPrefix?: string;
    }
  ) {
    this.grantRead(principal, options);
    this.grantWrite(principal, options);
  }

  public grantRead(
    principal: SearchPrincipal,
    options?: {
      indexPrefix?: string;
    }
  ) {
    this.grant(principal, {
      access: Access.Read,
      ...options,
    });
  }

  public grantWrite(
    principal: SearchPrincipal,
    options?: {
      indexPrefix?: string;
    }
  ) {
    this.grant(principal, {
      access: Access.Write,
      ...options,
    });
  }

  private grant(
    principal: SearchPrincipal,
    options: {
      access: Access;
      indexPrefix?: string;
    }
  ) {
    this.accessPolicy.grantAccess({
      ...options,
      principals: [
        "roleArn" in principal ? principal.roleArn : principal.federated,
      ],
    });
  }
}

/**
 * @see https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-encryption.html
 */
export interface SecurityPolicy {
  Rules: SecurityPolicyRule[];
  AWSOwnedKey: boolean;
  KmsARN?: string;
}

export interface SecurityPolicyRule {
  ResourceType: "collection";
  Resource: string[];
}

export interface NetworkPolicy {
  Rules: SecurityPolicyRule[];
  AllowFromPublic?: boolean;
  SourceVPCEs?: string[];
}
