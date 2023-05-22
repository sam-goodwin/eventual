import type { OpenSearchClient } from "../search-index.js";

declare global {
  // eslint-disable-next-line no-var
  var eventualOpenSearchHook: OpenSearchHook | undefined;
}

export interface OpenSearchHook {
  client: OpenSearchClient;
}

export function getOpenSearchHook() {
  const hook = globalThis.eventualOpenSearchHook;
  if (!hook) {
    throw new Error("An OpenSearch hook has not been registered.");
  }
  return hook;
}

export function registerOpenSearchHook(OpenSearchHook: OpenSearchHook) {
  return (globalThis.eventualOpenSearchHook = OpenSearchHook);
}
