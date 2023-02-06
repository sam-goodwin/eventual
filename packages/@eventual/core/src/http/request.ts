import type { z } from "zod";
import { RawBody } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpMethod } from "./method.js";
import type { Params } from "./params.js";

export type HttpRequest<Input extends HttpRequest.Input = HttpRequest.Input> = {
  url: string;
  method: HttpMethod;
  body: HttpRequest.Body<Input>;
  params: Params.FromSchema<Exclude<Input["params"], undefined>>;
  text(): Promise<string>;
  json(): Promise<HttpRequest.Json<HttpRequest.Schema<Input>>>;
  arrayBuffer(): Promise<ArrayBuffer>;
} & HttpHeaders.Envelope<Exclude<Input["headers"], undefined>>;

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
  > {
    type?: Type;
    body: Body;
    headers: Headers;
    params: PathParams;
    new (
      body: z.infer<Body>,
      ...[headers]: Headers extends undefined
        ? []
        : HttpHeaders.IsOptional<Headers> extends true
        ? [props?: HttpHeaders.Envelope<Headers>]
        : [props: HttpHeaders.Envelope<Headers>]
    ): HttpRequest<this>;
  }

  export type DefaultInput<Path extends string> = Input<
    Path,
    undefined,
    Params.Schema<Params.Parse<Path>>
  >;

  export type Input<
    Path extends string = string,
    Body extends z.ZodType<any> | undefined = z.ZodType<any> | undefined,
    PathParams extends Params.Schema<Params.Parse<Path>> = Params.Schema<
      Params.Parse<Path>
    >
  > = {
    type?: string;
    body?: Body;
    headers?: HttpHeaders.Schema;
    params?: PathParams;
  };

  export interface Schema<T extends Input> {
    type?: T["type"];
    body: T["body"] extends undefined
      ? z.ZodType<RawBody>
      : Exclude<T["body"], undefined>;
    headers: Exclude<T["headers"], undefined>;
    params: Exclude<T["params"], undefined>;
  }

  export type Json<T extends Input> = Body<T>;

  export type Body<T extends Input> = undefined extends T["body"]
    ? RawBody
    : z.infer<Exclude<T["body"], undefined>>;
}
