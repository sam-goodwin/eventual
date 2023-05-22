import { Resource, CustomResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { SearchPrincipal, SearchService } from "./search-service";
import type { opensearchtypes } from "@opensearch-project/opensearch";

export interface SearchIndexProps
  extends Exclude<opensearchtypes.IndicesCreateRequest["body"], undefined> {
  searchService: SearchService;
  indexName: string;
}

export class SearchIndex extends Resource {
  public readonly searchService: SearchService;
  public readonly indexName: string;
  public readonly resource: CustomResource;

  constructor(scope: Construct, id: string, props: SearchIndexProps) {
    super(scope, id, {
      physicalName: props.indexName,
    });
    this.searchService = props.searchService;
    const indexName = props.indexName;

    this.resource = new CustomResource(this, "Resource", {
      serviceToken: this.searchService.customResourceHandler.functionArn,
      resourceType: "Custom::OpenSearchIndex",
      properties: {
        index: indexName,
        body: {},
      } satisfies SearchIndexResourceProperties,
    });
    this.indexName = this.resource.getAttString("indexName");
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

export type SearchIndexResourceProperties =
  opensearchtypes.IndicesCreateRequest;

export interface SearchIndexResourceAttributes {
  IndexName: string;
}
