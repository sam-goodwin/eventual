import {
  HttpApiProps,
  HttpStage,
  IHttpApi,
  IHttpStage,
  VpcLink,
  VpcLinkProps,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { ApiBase } from "@aws-cdk/aws-apigatewayv2-alpha/lib/common/base.js";
import { CfnApi } from "aws-cdk-lib/aws-apigatewayv2";
import { Metric, MetricOptions } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { ApiDefinition } from "./http-api-definition.js";

/**
 * Taken from (and modified) closed cdk PR:
 * https://github.com/aws/aws-cdk/pull/20815
 */

abstract class HttpApiBase extends ApiBase implements IHttpApi {
  // note that this is not exported
  public abstract readonly apiId: string;
  public abstract readonly httpApiId: string;
  public abstract readonly apiEndpoint: string;
  private vpcLinks: Record<string, VpcLink> = {};
  public metricClientError(props?: MetricOptions): Metric {
    return this.metric("4xx", { statistic: "Sum", ...props });
  }

  public metricServerError(props?: MetricOptions): Metric {
    return this.metric("5xx", { statistic: "Sum", ...props });
  }

  public metricDataProcessed(props?: MetricOptions): Metric {
    return this.metric("DataProcessed", { statistic: "Sum", ...props });
  }

  public metricCount(props?: MetricOptions): Metric {
    return this.metric("Count", { statistic: "SampleCount", ...props });
  }

  public metricIntegrationLatency(props?: MetricOptions): Metric {
    return this.metric("IntegrationLatency", props);
  }

  public metricLatency(props?: MetricOptions): Metric {
    return this.metric("Latency", props);
  }

  public addVpcLink(options: VpcLinkProps): VpcLink {
    const { vpcId } = options.vpc;
    if (vpcId in this.vpcLinks) {
      return this.vpcLinks[vpcId]!;
    }
    const count = Object.keys(this.vpcLinks).length + 1;
    const vpcLink = new VpcLink(this, `VpcLink-${count}`, options);
    this.vpcLinks[vpcId] = vpcLink;
    return vpcLink;
  }
}

/**
 * Create a new API Gateway HTTP API endpoint from an OpenAPI Specification file.
 * @resource AWS::ApiGatewayV2::Api
 */
export class SpecHttpApi extends HttpApiBase {
  public readonly apiId: string;
  public readonly httpApiId: string;
  public readonly apiEndpoint: string;

  /**
   * The default stage of this API
   */
  public readonly defaultStage: IHttpStage | undefined;

  constructor(scope: Construct, id: string, props: SpecHttpApiProps) {
    super(scope, id);
    // this.httpApiName = props?.apiName;
    const apiDefConfig = props.apiDefinition.bind(this);

    props.apiDefinition.bindAfterCreate(this, this);

    const resource = new CfnApi(this, "Resource", {
      body: apiDefConfig.inlineDefinition ?? undefined,
      bodyS3Location: apiDefConfig.inlineDefinition
        ? undefined
        : apiDefConfig.s3Location,
    });

    this.apiId = resource.ref;
    this.httpApiId = resource.ref;
    this.apiEndpoint = resource.attrApiEndpoint;

    if (
      props?.createDefaultStage === undefined ||
      props.createDefaultStage === true
    ) {
      this.defaultStage = new HttpStage(this, "DefaultStage", {
        httpApi: this,
        autoDeploy: true,
        domainMapping: props?.defaultDomainMapping,
      });

      // to ensure the domain is ready before creating the default stage
      if (props?.defaultDomainMapping) {
        this.defaultStage.node.addDependency(
          props.defaultDomainMapping.domainName
        );
      }
    }

    if (props?.createDefaultStage === false && props.defaultDomainMapping) {
      throw new Error(
        "defaultDomainMapping not supported with createDefaultStage disabled"
      );
    }
  }
}

export type SpecHttpApiProps = Omit<
  HttpApiProps,
  | "corsPreflight"
  | "description"
  | "apiName"
  | "defaultIntegration"
  | "defaultAuthorizer"
  | "defaultAuthorizationScopes"
> & {
  /**
   * An OpenAPI definition compatible with API Gateway.
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-import-api.html
   */
  readonly apiDefinition: ApiDefinition;
};
