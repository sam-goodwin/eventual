import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpError } from "./error.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse, HttpResponseOrError } from "./response.js";

export interface HttpOperation<
  Path extends string,
  Input extends HttpRequest.Schema = HttpRequest.Schema,
  Output extends HttpResponse.Schema = HttpResponse.Schema,
  Errors extends HttpError.Schema = HttpError.Schema
> {
  kind: "HttpOperation";
  path: Path;
  request: Input;
  response: Output;
  errors: Error;
  (request: HttpRequest<Input>): Promise<HttpResponseOrError<Output, Errors>>;
}

export namespace HttpOperation {
  export interface Props<
    Path extends string = string,
    Input extends HttpRequest.Input<Path> = HttpRequest.Input<Path>,
    Output extends HttpResponse.Schema = HttpResponse.Schema,
    Errors extends HttpError.Schema = HttpError.Schema
  > extends FunctionRuntimeProps {
    input?: Input | Input[];
    output?: Output | Output[];
    errors?: Errors | Errors[];
  }

  export interface Handler<
    Path extends string = string,
    Input extends HttpRequest.Input<Path> = HttpRequest.Input<Path>,
    Output extends HttpResponse.Schema = HttpResponse.Schema,
    Errors extends HttpError.Schema = HttpError.Schema
  > {
    (request: HttpRequest<Input>):
      | HttpResponseOrError<Output, Errors>
      | Promise<HttpResponseOrError<Output, Errors>>;
  }

  export interface Router {
    <Path extends string>(path: Path, handler: Handler): HttpOperation<Path>;
    <
      Path extends string,
      Input extends HttpRequest.Input<Path> = HttpRequest.Input<Path>,
      Output extends HttpResponse.Schema = HttpResponse.Schema,
      Errors extends HttpError.Schema = HttpError.Schema
    >(
      path: Path,
      props: Props<Path, Input, Output, Errors>,
      handler: Handler<Path, Input, Output, Errors>
    ): HttpOperation<Path, Input, Output, Errors>;
  }
}
