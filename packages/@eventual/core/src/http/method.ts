import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpApiMethod, HttpGetApiMethod } from "./api.js";
import type { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import type { ParamsSchema, ParamValues } from "./params.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";

export enum HttpMethod {
  POST = "POST",
  GET = "GET",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
}

export declare namespace HttpMethod {
  export interface Props<
    Request extends HttpRequest.Schema | undefined =
      | HttpRequest.Schema
      | undefined,
    Response extends HttpResponse.Schema | undefined =
      | HttpResponse.Schema
      | undefined,
    Errors extends HttpError.Schema[] | undefined =
      | HttpError.Schema[]
      | undefined,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined,
    Params extends ParamsSchema | undefined = ParamsSchema | undefined
  > extends FunctionRuntimeProps {
    request?: Request;
    response?: Response;
    errors?: Errors;
    headers?: Headers;
    params?: Params;
  }

  export type Handler<
    Request extends HttpRequest.Schema | undefined =
      | HttpRequest.Schema
      | undefined,
    Response extends HttpResponse.Schema | undefined =
      | HttpResponse.Schema
      | undefined,
    Errors extends HttpError.Schema[] | undefined =
      | HttpError.Schema[]
      | undefined,
    Headers extends HttpHeaders.Schema | undefined =
      | HttpHeaders.Schema
      | undefined,
    Params extends ParamsSchema | undefined = ParamsSchema | undefined
  > = (
    request: HttpRequest.Payload<
      HttpRequest.ValueOf<Request>,
      Headers,
      ParamValues<Params>
    >
  ) =>
    | HttpResponse.Payload<Response, Errors>
    | Promise<HttpResponse.Payload<Response, Errors>>;

  export interface Router {
    <
      Path extends string,
      Request extends HttpRequest.Schema | undefined = undefined,
      Response extends HttpResponse.Schema | undefined = undefined,
      Errors extends HttpError.Schema[] | undefined = undefined,
      Headers extends HttpHeaders.Schema | undefined = undefined,
      Params extends ParamsSchema | undefined = undefined
    >(
      path: Path,
      props: Props<Request, Response, Errors, Headers, Params>,
      handler: Handler<Request, Response, Errors, Headers, Params>
    ): HttpApiMethod<Path, Request, Response, Errors, Headers, Params>;
  }

  export namespace Get {
    export interface Props<
      Response extends HttpResponse.Schema | undefined,
      Errors extends HttpError.Schema[] | undefined = undefined,
      Headers extends HttpHeaders.Schema | undefined = undefined,
      Params extends ParamsSchema | undefined = undefined
    > extends FunctionRuntimeProps {
      headers?: Headers;
      params?: Params;
      response?: Response;
      errors?: Errors;
    }

    export interface Router {
      <
        Path extends string,
        Response extends HttpResponse.Schema | undefined = undefined,
        Errors extends HttpError.Schema[] | undefined = undefined,
        Headers extends HttpHeaders.Schema | undefined = undefined,
        Params extends ParamsSchema | undefined = undefined
      >(
        path: Path,
        props: Props<Response, Errors, Headers, Params>,
        handler: Handler<undefined, Response, Errors, Headers, Params>
      ): HttpGetApiMethod<Path, Response, Errors, Headers, Params>;
    }
  }
}
