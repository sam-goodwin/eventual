import type { z } from "zod";
import type { HttpHeaders } from "./headers.js";
import { ParamValues } from "./params.js";

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
    constructor(
      readonly body: z.infer<Body>,
      props?: HttpHeaders.ValueOfEnvelope<Headers>
    ) {
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
        ? [props?: HttpHeaders.ValueOfEnvelope<Headers>]
        : [props: HttpHeaders.ValueOfEnvelope<Headers>]
    ): ValueOf<this>;
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

  export type ValueOf<T extends Schema | undefined> = T extends Schema
    ? {
        type: T["type"];
        body: z.infer<T["body"]>;
      } & HttpHeaders.ValueOf<T["headers"]>
    : undefined;

  export type Payload<
    Request = any,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined,
    Params extends ParamValues | undefined = ParamValues | undefined
  > = (undefined extends Request
    ? {}
    : {
        body: Request;
      }) &
    HttpHeaders.ValueOfEnvelope<Headers> &
    (ParamValues extends Params
      ? {
          params?: Params;
        }
      : {
          params: Params;
        });
}
