import type { z } from "zod";
import { RawBody } from "./body.js";
import { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import { SuccessHttpStatusCode } from "./status-code.js";

export function HttpResponse<
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
    constructor(
      readonly body: z.infer<Body>,
      props?: HttpHeaders.ValueOfEnvelope<Headers>
    ) {
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
      } & HttpHeaders.ValueOfEnvelope<T["headers"]>
    : undefined;

  export type Payload<
    Response extends Schema | undefined = Schema | undefined,
    Errors extends HttpError.Schema[] | undefined =
      | HttpError.Schema[]
      | undefined
  > = Response extends Schema
    ? ValueOf<Response>
    :
        | {
            body: RawBody;
          }
        | HttpError.ValuesOf<Errors>;
}
