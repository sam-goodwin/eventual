import { ApiRequest } from "@eventual/core";
import { BeforeRequest, HttpError, RequestHandler } from "./request-handler.js";

/**
 * A request handler that uses fetch, should work with browser or node fetch.
 */
export class FetchRequestHandler extends RequestHandler {
  constructor(beforeRequest?: BeforeRequest) {
    super(beforeRequest);
  }

  public async _request<Resp = any>(req: ApiRequest) {
    const request = new Request(req.url, {
      method: req.method,
      body: req.body ? req.body : undefined,
      headers: new Headers(req.headers),
    });

    const resp = await fetch(request);

    if (resp.ok) {
      return resp.json() as Resp;
    } else {
      throw new HttpError(
        resp.status,
        resp.statusText,
        resp.body ? await resp.text() : undefined
      );
    }
  }
}
