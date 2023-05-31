import {
  Domain,
  DomainProps,
  EngineVersion,
} from "aws-cdk-lib/aws-opensearchservice";
import { RemovalPolicy } from "aws-cdk-lib/core";
import { grant } from "../grant";
import {
  BaseSearchService,
  BaseSearchServiceProps,
} from "./base-search-service";
import type { SearchPrincipal } from "./search-service";
import type { ServerlessSearchService } from "./serverless-search-service";

export interface ServerfulSearchServiceProps<Service>
  extends BaseSearchServiceProps<Service>,
    Partial<DomainProps> {}

/**
 * Provisions a {@link SearchService} using the "serverful" {@link Domain}.
 *
 * The {@link Domain} provisions explicit EC2 instances to handle requests,
 * which puts the operational responsibility of scaling on the user instead
 * of the AWS OpenSearch team.
 *
 * We offer this capability because it is significantly cheaper for developer
 * environments and perhaps even in lower scale production applications.
 *
 * For high scale production applications, we recommend using the {@link ServerlessSearchService}.
 */
export class ServerfulSearchService<
  Service
> extends BaseSearchService<Service> {
  public readonly endpoint;
  public readonly domain;

  constructor(props: ServerfulSearchServiceProps<Service>) {
    super(props);

    this.domain = new Domain(this, "Domain", {
      ...props,
      capacity: {
        dataNodeInstanceType: "t3.small.search",
        dataNodes: 1,
        ...(props.capacity ?? {}),
      },
      // by default destroy - users should disable this for prod
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
      version: props.version ?? EngineVersion.OPENSEARCH_2_5,
    });
    this.endpoint = `https://${this.domain.domainEndpoint}`;
    this.domain.grantWrite(this.customResourceHandler);
  }

  @grant()
  public grantControl(principal: SearchPrincipal): void {
    this.domain.grantReadWrite(principal);
  }

  @grant()
  public grantReadWrite(principal: SearchPrincipal): void {
    this.domain.grantReadWrite(principal);
  }

  @grant()
  public grantRead(principal: SearchPrincipal): void {
    this.domain.grantRead(principal);
  }

  @grant()
  public grantWrite(principal: SearchPrincipal): void {
    this.domain.grantWrite(principal);
  }
}
