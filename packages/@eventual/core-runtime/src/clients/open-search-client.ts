import { assertApiResponseOK } from "@eventual/core";
import {
  EventualPropertyKind,
  OpenSearchClientProperty,
  SearchCall,
  assertNever,
  isServicePropertyOfKind,
} from "@eventual/core/internal";
import type { Client } from "@opensearch-project/opensearch";
import type {
  EventualExecutor,
  EventualPropertyResolver,
} from "../eventual-hook.js";

export abstract class OpenSearchClient
  implements
    EventualPropertyResolver<OpenSearchClientProperty>,
    EventualExecutor<SearchCall>
{
  constructor(public client: Client | (() => Client)) {}
  public getProperty(property: OpenSearchClientProperty): Client {
    if (
      isServicePropertyOfKind(EventualPropertyKind.OpenSearchClient, property)
    ) {
      return typeof this.client === "function" ? this.client() : this.client;
    }
    assertNever(property);
  }

  public async execute(call: SearchCall) {
    const response = await (this.client as any)[call.operation](call.request);
    assertApiResponseOK(response);
    return response.body;
  }
}
