import type { OpenSearchClient } from "@eventual/core";
import { Client } from "@opensearch-project/opensearch";

export class LocalOpenSearchClient implements OpenSearchClient {
  public get client(): Client {
    throw new Error(`Local OpenSearch is not implemented yet`);
  }
}
