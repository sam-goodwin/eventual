import type { HttpError } from "./error.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";

export interface HttpHandler<
  Path extends string = string,
  Input extends HttpRequest.Input<Path> = HttpRequest.Input<Path>,
  Output extends HttpResponse.Schema = HttpResponse.Schema,
  Errors extends HttpError.Schema = HttpError.Schema
> {
  (request: HttpRequest<Path, Input>):
    | HttpResponse.Of<Errors>
    | HttpResponse.Of<Output>
    | Promise<HttpResponse.Of<Errors> | HttpResponse.Of<Output>>;
}
