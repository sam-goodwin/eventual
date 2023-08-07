import { assertApiResponseOK } from "@eventual/core";
import { SearchCall } from "@eventual/core/internal";
import { CallExecutor } from "../eventual-hook.js";
import { OpenSearchClient } from "../index.js";

export class SearchCallExecutor implements CallExecutor<SearchCall> {
  constructor(public openSearchClient: OpenSearchClient) {}

  public async execute(call: SearchCall) {
    const response = await (
      this.openSearchClient.client[call.operation] as any
    )(call.request);
    assertApiResponseOK(response);
    return response.body;
  }
}
