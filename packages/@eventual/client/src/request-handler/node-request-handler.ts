// type imports can stay in the lexical imports
import type { ApiRequest } from "@eventual/core";
import type { ClientRequest, IncomingMessage } from "http";
import type { RequestOptions } from "https";
import type { Readable } from "stream";
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
    return JSON.parse(data);
  }
}

function writeBody(httpRequest: ClientRequest, body?: any) {
  if (body) {
    httpRequest.end(Buffer.from(body));
  } else {
    httpRequest.end();
  }
}

async function collectBody(body: IncomingMessage) {
  const arr = await collectStream(body);
  return await toUtf8(arr);
}

async function toUtf8(arr: Uint8Array): Promise<string> {
  return new TextDecoder("utf8").decode(arr);
}

async function collectStream(stream: Readable): Promise<Uint8Array> {
  let res = new Uint8Array(0);
  let isDone = false;
  while (!isDone) {
    const value = await stream.read();
    if (value !== null) {
      const prior = res;
      res = new Uint8Array(prior.length + value.length);
      res.set(prior);
      res.set(value, prior.length);
    }
    isDone = value === null;
  }
  return res;
}
