import { IndexSpec } from "@eventual/core/internal";
import type { opensearchtypes } from "@opensearch-project/opensearch";
import { CustomResource, Resource } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { SearchPrincipal, SearchService } from "./search-service.js";

/**
 * Attributes exposed by the {@link SearchIndex} Resource.
 */
export interface SearchIndexResourceAttributes {
  IndexName: string;
}

export interface SearchIndexProps
  extends Exclude<opensearchtypes.IndicesCreateRequest["body"], undefined> {
  searchService: SearchService;
  spec: IndexSpec;
}

/**
 * Creates an OpenSearch Index in an OpenSearch Domain or Collection.
 */
export class SearchIndex extends Resource {
  public readonly searchService: SearchService;
  public readonly indexName: string;
  public readonly resource: CustomResource;

  constructor(scope: Construct, id: string, props: SearchIndexProps) {
    super(scope, id, {
      physicalName: props.spec.index,
    });
    this.searchService = props.searchService;
    this.resource = new CustomResource(this, "Resource", {
      serviceToken: this.searchService.customResourceHandler.functionArn,
      resourceType: "Custom::OpenSearchIndex",
      properties: props.spec,
    });
    this.indexName = this.resource.getAttString("IndexName");
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
