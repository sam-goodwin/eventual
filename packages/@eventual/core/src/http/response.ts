import type { z } from "zod";
import type { HttpHeaders } from "./headers.js";
import type { HttpRequest } from "./request.js";
import type { HttpStatusCode } from "./status-code.js";

export type HttpResponse<
  Schema extends HttpResponse.Schema = HttpResponse.Schema
> = {
  status: Schema["status"];
  error?: never;
  statusText?: string;
  body: HttpRequest.Body<Schema>;
} & HttpHeaders.Envelope<Schema["headers"]>;

export function HttpResponse<
  Type extends string,
  Body extends z.ZodType,
  Headers extends HttpHeaders.Schema = HttpHeaders.Schema,
  Status extends HttpStatusCode = 200
>(
  type: Type,
  props: {
    body?: Body;
    status?: Status;
    statusText?: string;
    headers?: Headers;
  }
): HttpResponse.Class<Type, Body, Headers, Status> {
  return class HttpResponse {
    static readonly kind = "HttpResponse";
    static readonly type = type;
    static readonly body = props.body;
    static readonly status = props.status ?? 200;
    static readonly headers = props?.headers;

    readonly type = type;
    readonly status;
    readonly headers;
    constructor(readonly body: any, props?: HttpHeaders.Envelope) {
      this.status = HttpResponse.status;
      this.headers = props?.headers as any;
    }
  } as any;
}

export declare namespace HttpResponse {
  export interface Class<
    Type extends string,
    Body extends z.ZodType,
    Headers extends HttpHeaders.Schema,
    Status extends HttpStatusCode
  > {
    type: Type;
    body: Body;
    headers: Headers;
    status: Status;
    new (
      props: {
        body: z.infer<Body>;
      } & HttpHeaders.Envelope<Headers>
    ): Of<this>;
  }

  export interface Schema<Status extends HttpStatusCode = HttpStatusCode> {
    type?: string;
    body?: z.ZodType<any>;
    headers?: HttpHeaders.Schema;
    status: Status;
  }

  export type Of<T extends Schema | undefined> = T extends Schema
    ? HttpResponse<T>
    : HttpResponse<Schema>;
}
