import {
  BeforeRequest,
  HttpError,
  HttpRequest,
  RequestHandler,
} from "./request-handler.js";

/**
 * A request handler that uses fetch, should work with browser or node fetch.
 */
export class FetchRequestHandler extends RequestHandler {
  constructor(beforeRequest?: BeforeRequest) {
    super(beforeRequest);
  }

  public async _request<Resp = any>(req: HttpRequest) {
    const request = new Request(req.url, {
      method: req.method,
      body: req.body ? JSON.stringify(req.body) : undefined,
      headers: {
        ...req.headers,
        "Content-Type": "application/json",
      },
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
