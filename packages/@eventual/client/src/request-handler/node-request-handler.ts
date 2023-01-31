// type imports can stay in the lexical imports
import type { ApiRequest } from "@eventual/core";
import type { ClientRequest, IncomingMessage } from "http";
import type { RequestOptions } from "https";
import { BeforeRequest, HttpError, RequestHandler } from "./request-handler.js";

/**
 * A request handler that uses node's https module.
 * Will not work in the browser without a polyfill.
 */
export class NodeRequestHandler extends RequestHandler {
  constructor(beforeRequest?: BeforeRequest) {
    super(beforeRequest);
  }

  protected async _request<Resp = any>(inReq: ApiRequest): Promise<Resp> {
    const res = await new Promise<IncomingMessage>(async (resolve, reject) => {
      const url = new URL(inReq.url);
      const nodeHttpsOptions: RequestOptions = {
        headers: inReq.headers,
        method: inReq.method,
      };

      // dynamic import to avoid importing http in the browser
      const { request } = await import("https");

      const req = request(url, nodeHttpsOptions, resolve);

      req.on("error", (err) => {
        reject(err);
      });

      writeBody(req, inReq.body);
    });

    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
      throw new HttpError(
        res.statusCode ?? -1,
        res.statusMessage ?? "",
        await collectBody(res)
      );
    }

    const data = await collectBody(res);
    return data ? JSON.parse(data) : undefined;
  }
}

function writeBody(httpRequest: ClientRequest, body?: any) {
  if (body) {
    httpRequest.end(Buffer.from(body));
  } else {
    httpRequest.end();
  }
}

function collectBody(body: IncomingMessage) {
  let dArray: string[] | undefined = undefined;
  return new Promise<string | undefined>((resolve) => {
    body.on("data", (d) => {
      if (!dArray) {
        dArray = [];
      }
      dArray.push(d);
    });
    body.on("close", () => resolve(dArray ? dArray.join("") : undefined));
  });
}
