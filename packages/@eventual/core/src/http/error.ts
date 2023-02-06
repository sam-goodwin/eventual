import type z from "zod";
import type { HttpHeaders } from "./headers.js";
import { HttpResponse } from "./response.js";
import type { ErrorHttpStatusCode } from "./status-code.js";

export type HttpError<
  Schema extends HttpResponse.Schema = HttpResponse.Schema
> = HttpResponse<Schema>;

export function HttpError<
  Type extends string,
  Status extends ErrorHttpStatusCode,
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
): HttpResponse.Class<Type, Body, Headers, Status> {
  return HttpResponse(type, props) as HttpResponse.Class<
    Type,
    Body,
    Headers,
    Status
  >;
}

export declare namespace HttpError {
  export type Schema = HttpResponse.Schema<ErrorHttpStatusCode>;
}
