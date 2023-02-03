import type z from "zod";
import type { RawBody } from "./body.js";
import type { HttpHeaders } from "./headers.js";
import type { HttpStatusCode } from "./status-code.js";

export function HttpError<
  Type extends string,
  Status extends HttpStatusCode,
  Body extends z.ZodType = z.ZodAny,
  Headers extends HttpHeaders.Schema | undefined = undefined
>(
  type: Type,
  props: {
    status: Status;
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
    Headers extends HttpHeaders.Schema | undefined
  > extends Schema<Name, Status, Body, Headers> {
    new (
      body: z.infer<Body>,
      props?: {
        headers?: Headers;
      }
    ): ValueOf<this>;
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

  export type ValueOf<
    E extends {
      type: string;
      body: z.ZodType;
    }
  > = {
    type: E["type"];
    body: z.infer<E["body"]>;
  };

  export type ValuesOf<E extends Schema[] | undefined> = E extends Schema[]
    ? {
        type: Exclude<E, undefined>[number]["type"];
        status?: Exclude<E, undefined>[number]["status"];
        body: z.infer<Exclude<E, undefined>[number]["body"]>;
      }
    : {
        status: HttpStatusCode;
        body?: RawBody | undefined;
      };
}
