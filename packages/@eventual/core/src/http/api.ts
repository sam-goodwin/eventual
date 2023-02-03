import type { z } from "zod";
import type { HttpError } from "./error.js";
import type { HttpHeaders } from "./headers.js";
import type { ParamsSchema, ParamValues } from "./params.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";

export interface HttpGetApiMethod<
  Path extends string,
  Response extends HttpResponse.Schema | undefined,
  Errors extends HttpError.Schema[] | undefined,
  Headers extends HttpHeaders.Schema | undefined,
  Params extends ParamsSchema | undefined
> extends HttpApiMethod<Path, undefined, Response, Errors, Headers, Params> {}

export interface HttpApiMethod<
  Path extends string,
  Request extends HttpRequest.Schema | undefined,
  Response extends HttpResponse.Schema | undefined,
  Errors extends HttpError.Schema[] | undefined,
  Headers extends HttpHeaders.Schema | undefined,
  Params extends ParamsSchema | undefined
> {
  kind: "Api";
  path: Path;
  input: z.ZodType<Request>;
  responses: {};
  (
    request: HttpRequest.Payload<
      HttpRequest.ValueOf<Request>,
      Headers,
      ParamValues<Params>
    >
  ): Promise<HttpResponse.Payload<Response, Errors>>;
}
