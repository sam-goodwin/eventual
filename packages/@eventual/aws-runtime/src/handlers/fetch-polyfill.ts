// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// TODO: remove once we can upgrade to Node 18
import { Request, Response } from "node-fetch";

if (!globalThis.Request) {
  globalThis.Request = Request;
}
if (!globalThis.Response) {
  globalThis.Response = Response;
}
