import { Client } from "@opensearch-project/opensearch";
import { OpenSearchClient } from "../../clients/open-search-client.js";

export class LocalOpenSearchClient implements OpenSearchClient {
  public get client(): Client {
    throw new Error(`Local OpenSearch is not implemented yet`);
  }
}
