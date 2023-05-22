import { aws_opensearchservice } from "aws-cdk-lib";
import {
  BaseSearchService,
  BaseSearchServiceProps,
} from "./base-search-service";
import type { SearchPrincipal } from "./search-service";

export interface ServerfulSearchServiceProps
  extends BaseSearchServiceProps,
    Partial<aws_opensearchservice.DomainProps> {}

export class ServerfulSearchService extends BaseSearchService {
  readonly endpoint;
  readonly domain;

  constructor(props: ServerfulSearchServiceProps) {
    super(props.serviceScope, "Search");

    this.domain = new aws_opensearchservice.Domain(this, "", {
      ...props,
      capacity: {
        dataNodeInstanceType: "t3.small.search",
        dataNodes: 1,
        ...(props.capacity ?? {}),
      },
      version:
        props.version ?? aws_opensearchservice.EngineVersion.OPENSEARCH_2_5,
    });
    this.endpoint = this.domain.domainEndpoint;
  }

  public grantReadWrite(principal: SearchPrincipal): void {
    this.domain.grantReadWrite(principal);
  }

  public grantRead(principal: SearchPrincipal): void {
    this.domain.grantRead(principal);
  }

  public grantWrite(principal: SearchPrincipal): void {
    this.domain.grantWrite(principal);
  }
}
