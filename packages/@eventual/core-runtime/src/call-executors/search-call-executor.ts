import { assertApiResponseOK } from "@eventual/core";
import type { SearchCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { OpenSearchClient } from "../index.js";

export class SearchCallExecutor implements CallExecutor<SearchCall> {
  constructor(public openSearchClient: OpenSearchClient) {}

  public async execute(call: SearchCall) {
    const response = await (
      this.openSearchClient.client[call.operation] as any
    )({
      ...(call.operation === "index" ? call.request : { body: call.request }),
      index: call.indexName,
    });
    assertApiResponseOK(response);
    return response.body;
  }
}
