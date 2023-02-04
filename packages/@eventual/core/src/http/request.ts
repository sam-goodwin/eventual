import type { z } from "zod";
import { RawBody } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import { HttpMethod } from "./method.js";
import { Params } from "./params.js";

export type HttpRequest<
  Request extends HttpRequest.Schema | undefined = undefined,
  Headers extends HttpHeaders.Schema | undefined =
    | HttpHeaders.Schema
    | undefined,
  Params extends Params.Schema | undefined = Params.Schema | undefined
> = {
  url: string;
  method: HttpMethod;
  body: HttpRequest.Body<Request>;
  text(): Promise<string>;
  json(): Promise<HttpRequest.Json<Request>>;
  arrayBuffer(): Promise<ArrayBuffer>;
} & HttpHeaders.Envelope<Headers> &
  (Params.Schema extends Params
    ? {
        params?: Params.FromSchema<Params>;
      }
    : {
        params: Params.FromSchema<Params>;
      });

export function HttpRequest<
  Type extends string,
  Body extends z.ZodType,
  Headers extends HttpHeaders.Schema | undefined = undefined
>(
  type: Type,
  props: {
    body: Body;
    headers?: Headers;
  }
): HttpRequest.Class<Type, Body, Headers> {
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
    Headers extends HttpHeaders.Schema | undefined
  > extends Schema<Type, Body, Headers> {
    new (
      body: z.infer<Body>,
      ...[headers]: Headers extends undefined
        ? []
        : HttpHeaders.IsOptional<Headers> extends true
        ? [props?: HttpHeaders.Envelope<Headers>]
        : [props: HttpHeaders.Envelope<Headers>]
    ): FromSchema<this>;
  }

  export interface Schema<
    Type extends string = string,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined
  > {
    kind: "Request";
    type: Type;
    body: Body;
    headers: Headers;
  }

  export type Json<T extends Schema | undefined> = T extends undefined
    ? any
    : HttpRequest.FromSchema<Exclude<T, undefined>>["body"];

  export type Body<T extends Schema | undefined> = T extends undefined
    ? RawBody
    : HttpRequest.FromSchema<Exclude<T, undefined>>["body"];

  export type FromSchema<T extends Schema | undefined> = T extends Schema
    ? {
        type: T["type"];
        body: z.infer<T["body"]>;
      } & HttpHeaders.FromSchema<T["headers"]>
    : undefined;
}
