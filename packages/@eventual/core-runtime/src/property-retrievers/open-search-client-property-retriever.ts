import {
  EventualPropertyType,
  OpenSearchClientProperty,
} from "@eventual/core/internal";
import { OpenSearchClient } from "../clients/open-search-client.js";
import { EventualPropertyResolver } from "../eventual-hook.js";

export class OpenSearchClientPropertyRetriever
  implements EventualPropertyResolver<OpenSearchClientProperty>
{
  constructor(public openSearchClient: OpenSearchClient) {}
  public getProperty(_property: OpenSearchClientProperty) {
    return this.openSearchClient
      .client as EventualPropertyType<OpenSearchClientProperty>;
  }
}
