import type {
  OpenSearchClientProperty,
  PropertyType,
} from "@eventual/core/internal";
import type { OpenSearchClient } from "../clients/open-search-client.js";
import type { PropertyResolver } from "../property-retriever.js";

export class OpenSearchClientPropertyRetriever
  implements PropertyResolver<OpenSearchClientProperty>
{
  constructor(public openSearchClient: OpenSearchClient) {}
  public getProperty(_property: OpenSearchClientProperty) {
    return this.openSearchClient
      .client as PropertyType<OpenSearchClientProperty>;
  }
}
