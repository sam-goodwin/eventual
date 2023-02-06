import type { z } from "zod";
import type { RawBody } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpMethod } from "./method.js";
import type { Params } from "./params.js";

export type HttpRequest<
  Path extends string = string,
  Schema extends HttpRequest.Schema<Path> = HttpRequest.Schema<Path>
> = {
  url: string;
  method: HttpMethod;
  body: HttpRequest.Body<Schema>;
  params: HttpRequest.Params<Path, Schema>;
  text(): Promise<string>;
  json(): Promise<HttpRequest.Json<Schema>>;
  arrayBuffer(): Promise<ArrayBuffer>;
} & HttpHeaders.Envelope<Exclude<Schema["headers"], undefined>>;

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
    PathParams extends Params.Schema = Params.Schema,
    Path extends string = string
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
    ): HttpRequest<Path, this>;
  }

  export interface Schema<Path extends string> {
    type?: string;
    body?: z.ZodType<any>;
    headers?: HttpHeaders.Schema;
    params?: Params.Schema<Params.Parse<Path>>;
  }

  export type Params<Path extends string, T extends Schema<Path>> = T extends {
    params: infer P extends Params.Schema;
  }
    ? Params.FromSchema<P>
    : {
        [parameterName in Params.Parse<Path>]: string;
      };

  export type Json<T extends Schema<string>> = T extends {
    body: infer B extends z.ZodType;
  }
    ? z.infer<B>
    : any;

  export type Body<T extends Schema<string>> = T extends {
    body: infer B extends z.ZodType;
  }
    ? z.infer<B>
    : RawBody;
}
