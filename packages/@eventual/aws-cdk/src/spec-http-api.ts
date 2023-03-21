import {
  HttpApiProps,
  IHttpApi,
  VpcLink,
  VpcLinkProps,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { ApiBase } from "@aws-cdk/aws-apigatewayv2-alpha/lib/common/base";
import { CfnApi } from "aws-cdk-lib/aws-apigatewayv2";
import { Metric, MetricOptions } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { ApiDefinition } from "./http-api-definition";

/**
 * Properties to initialize an instance of `SpecHttpApi`
 */
export interface SpecHttpApiProps {
  /**
   * An OpenAPI definition compatible with API Gateway.
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-import-api.html
   */
  readonly apiDefinition: ApiDefinition;

  /**
   * Name for the HTTP API resource
   * @default - id of the HttpApi construct.
   */
  readonly apiName?: string;
}

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
  /**
   * A human friendly name for this HTTP API. Note that this is different from `httpApiId`.
   */
  readonly httpApiName: string;
  readonly apiId: string;
  readonly httpApiId: string;
  readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: SpecHttpApiProps) {
    super(scope, id);
    this.httpApiName = props?.apiName ?? id;
    const apiDefConfig = props.apiDefinition.bind(this);
    const resource = new CfnApi(this, "Resource", {
      name: this.httpApiName,
      body: apiDefConfig.inlineDefinition ?? undefined,
      bodyS3Location: apiDefConfig.inlineDefinition
        ? undefined
        : apiDefConfig.s3Location,
    });

    props.apiDefinition.bindAfterCreate(this, this);

    this.apiId = resource.ref;
    this.httpApiId = resource.ref;
    this.apiEndpoint = resource.attrApiEndpoint;
  }
}

export interface SpecHttpApiProps extends HttpApiProps {
  /**
   * Name for the HTTP API resource
   * @default - id of the HttpApi construct.
   */
  readonly apiName?: string;
}
