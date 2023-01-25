if (!globalThis.fetch) {
  const nodeFetch = require("node-fetch");
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  globalThis.Headers =
    nodeFetch.Headers as unknown as typeof globalThis.Headers;
  globalThis.Request =
    nodeFetch.Request as unknown as typeof globalThis.Request;
  globalThis.Response =
    nodeFetch.Response as unknown as typeof globalThis.Response;
}
