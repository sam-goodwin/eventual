import { HttpRequest, HttpResponse } from "./request-response.js";

export interface MiddlewareInput<In> {
  request: HttpRequest;
  context: In;
  next: <O>(context: O) => Promise<MiddlewareOutput<O>>;
}

export interface MiddlewareOutput<Context> extends HttpResponse {
  context?: Context;
}

export type Middleware<In, Out> = (
  input: MiddlewareInput<In>
) => Promise<MiddlewareOutput<Out>> | MiddlewareOutput<Out>;
