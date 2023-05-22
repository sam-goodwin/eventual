import { Resource, CustomResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { SearchPrincipal, SearchService } from "./search-service";

export interface SearchIndexProps {
  searchService: SearchService;
  indexName: string;
}

export class SearchIndex extends Resource {
  readonly searchService: SearchService;
  readonly indexName: string;
  readonly resource: CustomResource;

  constructor(scope: Construct, id: string, props: SearchIndexProps) {
    super(scope, id, {
      physicalName: props.indexName,
    });
    this.searchService = props.searchService;
    this.indexName = props.indexName;

    this.resource = new CustomResource(this, "Resource", {
      serviceToken: this.searchService.customResourceHandler.functionArn,
      resourceType: "Custom::OpenSearchIndex",
      properties: {
        endpoint: this.searchService.endpoint,
      },
    });
  }

  public grantReadWrite(principal: SearchPrincipal) {
    this.searchService.grantReadWrite(principal, {
      indexPrefix: this.indexName,
    });
  }

  public grantRead(principal: SearchPrincipal) {
    this.searchService.grantRead(principal, {
      indexPrefix: this.indexName,
    });
  }

  public grantWrite(principal: SearchPrincipal) {
    this.searchService.grantWrite(principal, {
      indexPrefix: this.indexName,
    });
  }
}
