import type z from "zod";
import type { HttpHeaders } from "./headers.js";
import { HttpResponse } from "./response.js";
import type { HttpStatusCode } from "./status-code.js";

export type HttpError<
  Type extends string = string,
  Status extends HttpStatusCode = HttpStatusCode,
  Body extends z.ZodType = z.ZodType,
  Headers extends HttpHeaders.Schema = HttpHeaders.Schema
> = HttpResponse<Type, Status, Body, Headers>;

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
): HttpResponse.Class<HttpResponse.Schema<Type, Body, Headers, Status>> {
  return HttpResponse(type, props) as HttpResponse.Class<
    HttpResponse.Schema<Type, Body, Headers, Status>
  >;
}

export declare namespace HttpError {
  export type Schema<
    Type extends string = string,
    Body extends z.ZodType = z.ZodType,
    Headers extends HttpHeaders.Schema = HttpHeaders.Schema,
    Status extends HttpStatusCode = HttpStatusCode
  > = HttpResponse.Schema<Type, Body, Headers, Status>;
}
