import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import type { Params } from "./params.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";

export interface HttpOperation<
  Path extends string,
  Request extends HttpRequest.Schema | undefined = undefined,
  Response extends HttpResponse.Schema | undefined = undefined,
  Errors extends HttpError.Schema[] | undefined = undefined,
  Headers extends HttpHeaders.Schema | undefined = undefined,
  Params extends Params.Schema | undefined = undefined
> {
  kind: "HttpOperation";
  path: Path;
  request: Request;
  response: Response;
  errors: Error;
  headers: Headers;
  params: Params;
  (request: HttpRequest<Request, Headers, Params>): Promise<
    HttpResponse<Response, Errors>
  >;
}

export namespace HttpOperation {
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
    Params extends Params.Schema | undefined = Params.Schema | undefined
  > extends FunctionRuntimeProps {
    request?: Request;
    response?: Response;
    errors?: Errors;
    headers?: Headers;
    params?: Params;
  }

  export interface Handler<
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
    Params extends Params.Schema | undefined = Params.Schema | undefined
  > {
    (request: HttpRequest<Request, Headers, Params>):
      | HttpResponse<Response, Errors>
      | Promise<HttpResponse<Response, Errors>>;
  }

  export interface Router {
    <
      Path extends string,
      Request extends HttpRequest.Schema | undefined = undefined,
      Response extends HttpResponse.Schema | undefined = undefined,
      Errors extends HttpError.Schema[] | undefined = undefined,
      Headers extends HttpHeaders.Schema | undefined = undefined,
      Params extends Params.Schema | undefined = undefined
    >(
      path: Path,
      props: Props<Request, Response, Errors, Headers, Params>,
      handler: Handler<Request, Response, Errors, Headers, Params>
    ): HttpOperation<Path, Request, Response, Errors, Headers, Params>;
    <Path extends string>(path: Path, handler: Handler): HttpOperation<Path>;
  }

  export interface Get<
    Path extends string,
    Response extends HttpResponse.Schema | undefined,
    Errors extends HttpError.Schema[] | undefined,
    Headers extends HttpHeaders.Schema | undefined,
    Params extends Params.Schema | undefined
  > extends HttpOperation<Path, undefined, Response, Errors, Headers, Params> {}

  export namespace Get {
    export interface Props<
      Response extends HttpResponse.Schema | undefined,
      Errors extends HttpError.Schema[] | undefined = undefined,
      Headers extends HttpHeaders.Schema | undefined = undefined,
      Params extends Params.Schema | undefined = undefined
    > extends FunctionRuntimeProps {
      headers?: Headers;
      params?: Params;
      response?: Response;
      errors?: Errors;
    }

    export interface Router {
      <Path extends string>(path: Path, handler: Handler): HttpOperation<Path>;
      <
        Path extends string,
        Response extends HttpResponse.Schema | undefined = undefined,
        Errors extends HttpError.Schema[] | undefined = undefined,
        Headers extends HttpHeaders.Schema | undefined = undefined,
        Params extends Params.Schema | undefined = undefined
      >(
        path: Path,
        props: Props<Response, Errors, Headers, Params>,
        handler: Handler<undefined, Response, Errors, Headers, Params>
      ): HttpOperation.Get<Path, Response, Errors, Headers, Params>;
    }
  }
}
