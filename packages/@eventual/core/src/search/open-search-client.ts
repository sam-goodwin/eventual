import type { Client } from "@opensearch-project/opensearch";

export interface OpenSearchClient {
  client: Client;
}
