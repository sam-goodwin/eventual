import type { z } from "zod";
import type { RawBody } from "./body.js";
import type { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import { RawHttpResponse, RawHttpResponseInit } from "./raw.js";
import type { HttpStatusCode, SuccessHttpStatusCode } from "./status-code.js";

export type HttpResponse<
  Response extends HttpResponse.Schema | undefined =
    | HttpResponse.Schema
    | undefined,
  Errors extends HttpError.Schema[] | undefined = HttpError.Schema[] | undefined
> =
  | HttpError.ValuesOf<Errors>
  | (HttpResponse.Schema extends Response
      ? {
          body: RawBody;
          status: HttpStatusCode;
          headers?: HttpHeaders.FromSchema;
        }
      : HttpResponse.ValueOf<Response>);

export const HttpResponse: {
  <
    Type extends string,
    Body extends z.ZodType,
    Headers extends HttpHeaders.Schema | undefined = undefined,
    Status extends SuccessHttpStatusCode = 200
  >(
    type: Type,
    props: {
      body: Body;
      status?: Status;
      headers?: Headers;
    }
  ): HttpResponse.Class<Type, Body, Headers>;

  new (url: string, init: RawHttpResponseInit): HttpResponse;
} = function (
  ...args:
    | Parameters<typeof HttpResponse>
    | ConstructorParameters<typeof HttpResponse>
) {
  if (new.target) {
    const [url, init] = args as ConstructorParameters<typeof HttpResponse>;
    return new RawHttpResponse(url, init);
  } else {
    const [type, props] = args as Parameters<typeof HttpResponse>;
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
} as any;

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
      // // body: z.infer<Body>,
      // ...[headers]: Headers extends undefined
      //   ? [body: z.infer<Body>]
      //   : HttpHeaders.IsOptional<Headers> extends true
      //   ? [body: z.infer<Body>]
      //   : [props: HttpHeaders.ValueOfEnvelope<Headers>, body: z.infer<Body>]
    ): ValueOf<this>;
  }

  export interface Schema<
    Type extends string = string,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined,
    Status extends SuccessHttpStatusCode = 200
  > {
    kind: "Response";
    type: Type;
    body: Body;
    headers: Headers;
    status: Status;
  }
  export type ValueOf<T extends Schema | undefined> = T extends Schema
    ? {
        type: T["type"];
        body: z.infer<T["body"]>;
        status: T["status"];
      } & HttpHeaders.Envelope<T["headers"]>
    : undefined;
}
