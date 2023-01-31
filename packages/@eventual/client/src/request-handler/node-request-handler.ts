// type imports can stay in the lexical imports
import { ApiRequest } from "@eventual/core";
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

  protected _request<Resp = any>(inReq: ApiRequest): Promise<Resp> {
    return new Promise(async (resolve) => {
      const url = new URL(inReq.url);
      const nodeHttpsOptions: RequestOptions = {
        headers: inReq.headers,
        method: inReq.method,
      };

      // dynamic import to avoid importing http in the browser
      const { request } = await import("https");

      const req = request(url, nodeHttpsOptions, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          throw new HttpError(
            res.statusCode ?? -1,
            res.statusMessage ?? "",
            consumeMessage(res)
          );
        }

        const data = consumeMessage(res);
        resolve(data !== undefined ? JSON.parse(data) : undefined);
      });

      writeBody(req, inReq.body);
    });
  }
}

function consumeMessage(message: IncomingMessage): string | undefined {
  let data: string | undefined = undefined;
  message.on("data", (d) => {
    if (data === undefined) {
      data = "";
    }
    data += d;
  });
  return data;
}

function writeBody(httpRequest: ClientRequest, body?: any) {
  if (body) {
    httpRequest.end(Buffer.from(body));
  } else {
    httpRequest.end();
  }
}
