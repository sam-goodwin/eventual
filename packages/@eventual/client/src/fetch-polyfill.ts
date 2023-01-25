/**
 * Try to dynamically import node-fetch if needed.
 *
 * Why not top-level await? Won't work in CJS.
 * Why not import? Node-fetch doesn't work in the browser and is necessary.
 * Why not require? Require must also be polyfilled.
 *
 * Import works in all cases, but must be in an async function.
 * ESBuild can discover and bundle dynamic import statments.
 */
export async function polyfillFetch() {
  if (!globalThis.fetch) {
    const nodeFetch = await import("node-fetch");
    globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
    globalThis.Headers =
      nodeFetch.Headers as unknown as typeof globalThis.Headers;
    globalThis.Request =
      nodeFetch.Request as unknown as typeof globalThis.Request;
    globalThis.Response =
      nodeFetch.Response as unknown as typeof globalThis.Response;
  }
}
