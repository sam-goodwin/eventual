import type z from "zod";
import type { BodyEnvelope } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpStatusCode } from "./status-code.js";

export type HttpError<
  Type extends string = string,
  Status extends HttpStatusCode = HttpStatusCode,
  Body extends z.ZodType | undefined = undefined,
  Headers extends HttpHeaders.Schema = HttpHeaders.Schema
> = {
  status: Status;
  statusText?: string;
} & BodyEnvelope<Body> &
  HttpHeaders.Envelope<Headers>;

export function HttpError<
  Type extends string,
  Status extends HttpStatusCode,
  Body extends z.ZodType = z.ZodUndefined,
  Headers extends HttpHeaders.Schema = HttpHeaders.Schema
>(
  type: Type,
  props: {
    status: Status;
    statusText?: string;
    body?: Body;
    headers?: Headers;
  }
): HttpError.Class<Type, Status, Body, Headers> {
  return class extends Error {
    static readonly kind = "ApiError";
    static readonly type = type;
    static readonly status = props.status;
    static readonly body = (props.body ?? undefined) as Body;
    static readonly headers = props.headers as Headers;

    public readonly headers?: Headers;

    constructor(readonly body: any, props?: any) {
      super(type);
      this.headers = props?.headers;
    }
  } as any;
}

export declare namespace HttpError {
  export interface Class<
    Name extends string,
    Status extends HttpStatusCode,
    Body extends z.ZodType,
    Headers extends HttpHeaders.Schema
  > extends Schema<Name, Status, Body, Headers> {
    new (
      body: z.infer<Body>,
      props?: {
        headers?: Headers;
      }
    ): HttpError<Name, Status, Body, Headers>;
  }

  export interface Schema<
    Type extends string = string,
    Status extends HttpStatusCode = HttpStatusCode,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined
  > extends Error {
    kind: "ApiError";
    status: Status;
    type: Type;
    body: Body;
    headers: Headers;
  }

  export type Of<E extends Schema[] | Schema | undefined> = E extends Schema[]
    ? Of<E[number]>
    : E extends Schema
    ? HttpError<
        E["type"],
        E["status"],
        E["body"],
        Exclude<E["headers"], undefined>
      >
    : HttpError;
}
