if (!globalThis.fetch) {
  /**
   * For ES Bundles, Eventual defines require at the top of each bundle.
   *
   * import { createRequire as topLevelCreateRequire } from "module";
   * const require = topLevelCreateRequire(import.meta.url);
   */
  const nodeFetch = require("node-fetch");
  globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
  globalThis.Headers =
    nodeFetch.Headers as unknown as typeof globalThis.Headers;
  globalThis.Request =
    nodeFetch.Request as unknown as typeof globalThis.Request;
  globalThis.Response =
    nodeFetch.Response as unknown as typeof globalThis.Response;
}
