import type { z } from "zod";
import type { HttpHeaders } from "./headers.js";
import { ParamValues } from "./params.js";
import { RawHttpRequestInit, RawHttpRequest } from "./raw.js";

export type HttpRequest<
  Request = any,
  Headers extends HttpHeaders.Schema | undefined =
    | HttpHeaders.Schema
    | undefined,
  Params extends ParamValues | undefined = ParamValues | undefined
> = (Request extends undefined ? {} : Request) &
  HttpHeaders.Envelope<Headers> &
  (ParamValues extends Params
    ? {
        params?: Params;
      }
    : {
        params: Params;
      });

export const HttpRequest: {
  <
    Type extends string,
    Body extends z.ZodType,
    Headers extends HttpHeaders.Schema | undefined = undefined
  >(
    type: Type,
    props: {
      body: Body;
      headers?: Headers;
    }
  ): HttpRequest.Class<Type, Body, Headers>;

  new (url: string, init: RawHttpRequestInit): HttpRequest;
} = function (
  ...args:
    | Parameters<typeof HttpRequest>
    | ConstructorParameters<typeof HttpRequest>
) {
  if (new.target) {
    const [url, init] = args as ConstructorParameters<typeof HttpRequest>;
    return new RawHttpRequest(url, init);
  } else {
    const [type, props] = args as Parameters<typeof HttpRequest>;
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
} as any;

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

  export type FromSchema<T extends Schema | undefined> = T extends Schema
    ? {
        type: T["type"];
        body: z.infer<T["body"]>;
      } & HttpHeaders.FromSchema<T["headers"]>
    : undefined;
}
