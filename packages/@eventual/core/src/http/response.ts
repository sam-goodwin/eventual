import type { z } from "zod";
import type { RawBody } from "./body.js";
import type { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpStatusCode } from "./status-code.js";

export type HttpResponseOrError<
  Response extends HttpResponse.Schema | undefined = undefined,
  Errors extends HttpError.Schema[] | undefined = undefined
> = HttpError.Of<Errors> | HttpResponse.Of<Response>;

export type HttpResponse<
  Type extends string = string,
  Status extends HttpStatusCode = HttpStatusCode,
  Body extends z.ZodType | undefined = undefined,
  Headers extends HttpHeaders.Schema | undefined = undefined
> = {
  status: Status;
  error?: never;
  statusText?: string;
  body: Body extends undefined ? RawBody : z.infer<Exclude<Body, undefined>>;
} & HttpHeaders.Envelope<Headers>;

export function HttpResponse<
  Type extends string,
  Body extends z.ZodType,
  Headers extends HttpHeaders.Schema | undefined = undefined,
  Status extends HttpStatusCode = 200
>(
  type: Type,
  props: {
    body: Body;
    status?: Status;
    headers?: Headers;
  }
): HttpResponse.Class<Type, Body, Headers> {
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
    Headers extends HttpHeaders.Schema | undefined
  > extends Schema<Type, Body, Headers> {
    new (
      props: {
        body: z.infer<Body>;
      } & HttpHeaders.Envelope<Headers>
    ): Of<this>;
  }

  export interface Schema<
    Type extends string = string,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined,
    Status extends HttpStatusCode = 200
  > {
    kind: "Response";
    type: Type;
    body: Body;
    headers: Headers;
    status: Status;
  }
  export type Of<T extends Schema | undefined> = T extends Schema
    ? HttpResponse<T["type"], T["status"], T["body"], T["headers"]>
    : HttpResponse;
}
