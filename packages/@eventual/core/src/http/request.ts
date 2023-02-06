import type { z } from "zod";
import { RawBody } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpMethod } from "./method.js";
import type { Params } from "./params.js";

export type HttpRequest<
  Request extends HttpRequest.Schema = HttpRequest.Schema
> = {
  url: string;
  method: HttpMethod;
  body: HttpRequest.Body<Request>;
  text(): Promise<string>;
  json(): Promise<HttpRequest.Json<Request>>;
  arrayBuffer(): Promise<ArrayBuffer>;
} & HttpHeaders.Envelope<Exclude<Request["headers"], undefined>> &
  (Params.Schema extends Params
    ? {
        params?: Params.FromSchema<Exclude<Request["params"], undefined>>;
      }
    : {
        params: Params.FromSchema<Exclude<Request["params"], undefined>>;
      });

export function HttpRequest<
  Type extends string,
  Body extends z.ZodType,
  Headers extends HttpHeaders.Schema = HttpHeaders.Schema,
  PathParams extends Params.Schema = Params.Schema
>(
  type: Type,
  props: {
    body: Body;
    headers?: Headers;
    params?: PathParams;
  }
): HttpRequest.Class<Type, Body, Headers, PathParams> {
  return class HttpRequest {
    static readonly kind = "HttpRequest";
    static readonly type = type;
    static readonly body = props.body;
    static readonly headers = props?.headers;

    readonly type = type;
    readonly headers;
    constructor(readonly body: any, props?: HttpHeaders.Envelope) {
      this.headers = props?.headers;
    }
  } as any;
}

export declare namespace HttpRequest {
  export interface Class<
    Type extends string,
    Body extends z.ZodType,
    Headers extends HttpHeaders.Schema,
    PathParams extends Params.Schema = Params.Schema
  > extends Schema<Type, Body, Headers, PathParams> {
    new (
      body: z.infer<Body>,
      ...[headers]: Headers extends undefined
        ? []
        : HttpHeaders.IsOptional<Headers> extends true
        ? [props?: HttpHeaders.Envelope<Headers>]
        : [props: HttpHeaders.Envelope<Headers>]
    ): HttpRequest<this>;
  }

  export type Input<Path extends string> = Partial<
    Schema<
      string,
      z.ZodType<any>,
      HttpHeaders.Schema,
      Params.Schema<Params.Parse<Path>>
    >
  >;

  export interface Schema<
    Type extends string = string,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema = HttpHeaders.Schema,
    PathParams extends Params.Schema = Params.Schema
  > {
    kind?: "Request";
    type?: Type;
    body?: Body;
    headers?: Headers;
    params?: PathParams;
  }

  export type Json<T extends Schema> = T extends undefined ? any : Body<T>;

  export type Body<T extends Schema> = T["body"] extends undefined
    ? RawBody
    : z.infer<Exclude<T["body"], undefined>>;
}
