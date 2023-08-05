import { OpenSearchClient } from "../../clients/open-search-client.js";

export class LocalOpenSearchClient extends OpenSearchClient {
  constructor() {
    super(() => {
      throw new Error(`Local OpenSearch is not implemented yet`);
    });
  }
}
