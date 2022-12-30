// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// TODO: remove once we can upgrade to Node 18

import fetch, { Headers, Request, Response } from "node-fetch";

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}
