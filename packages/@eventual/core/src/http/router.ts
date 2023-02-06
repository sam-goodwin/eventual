import itty from "itty-router";

import { routes } from "../global.js";

import type { SourceLocation } from "../app-spec.js";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpError } from "./error.js";
import type { HttpHandler } from "./handler.js";
import type { HttpMethod } from "./method.js";
import type { RawHttpRequest, RawHttpResponse } from "./raw.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";
import { Params } from "./params.js";

const router = itty.Router() as any as HttpRouter;

export type RouteEntry = [string, RegExp, HttpHandler];

export interface Route {
  path: string;
  handlers: HttpHandler[];
  method: HttpMethod;
  runtimeProps?: HttpRouteProps<any, any, any, any>;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface HttpRouter {
  handle: (
    request: HttpRequest | RawHttpRequest,
    ...extra: any
  ) => Promise<RawHttpResponse | HttpResponse>;
  routes: RouteEntry[];
  all: HttpRouteFactory;
  get: HttpRouteFactory;
  head: HttpRouteFactory;
  post: HttpRouteFactory;
  put: HttpRouteFactory;
  delete: HttpRouteFactory;
  connect: HttpRouteFactory;
  options: HttpRouteFactory;
  trace: HttpRouteFactory;
  patch: HttpRouteFactory;
}

/**
 * This Proxy intercepts the method  being called, e.g. `get`, `post`, etc.
 * and includes that information in the created {@link Route} object. This
 * information is then picked up during infer so we know the HTTP method
 * for each route.
 *
 * It also includes `sourceLocation` (injected by the compiler), `path`, and
 * any `runtimeProps` passed in by the user.
 *
 * @see Route for all the metadata associated with each route
 */
export const api: HttpRouter = new Proxy(
  {},
  {
    get: (_, method: keyof typeof router) => {
      if (method === "routes" || method === "handle") {
        return router[method];
      } else {
        return (
          ...args:
            | [SourceLocation, string, ...HttpHandler[]]
            | [SourceLocation, string, HttpRouteProps, ...HttpHandler[]]
            | [string, ...HttpHandler[]]
            | [string, HttpRouteProps, ...HttpHandler[]]
        ) => {
          const route: Route = {
            sourceLocation: typeof args[0] === "object" ? args[0] : undefined,
            path: (typeof args[0] === "string" ? args[0] : args[1]) as string,
            method: method.toUpperCase() as HttpMethod,
            runtimeProps:
              typeof args[0] === "string"
                ? typeof args[1] === "object"
                  ? args[1]
                  : undefined
                : typeof args[2] === "object"
                ? args[2]
                : undefined,
            handlers: args.filter(
              (a: any): a is HttpHandler => typeof a === "function"
            ) as HttpHandler[], // todo: why do i need to cast?
          };
          routes.push(route);
          // @ts-expect-error - functions don't overlap, but we know they can be called together
          return router[method](route.path, ...route.handlers);
        };
      }
    },
  }
) as any;

export interface HttpRouteProps<
  Path extends string = string,
  Input extends HttpRequest.Input<Path> = HttpRequest.Input<
    Path,
    undefined,
    Params.Schema<Params.Parse<Path>>
  >,
  Output extends HttpResponse.Schema = HttpResponse.Schema,
  Errors extends HttpError.Schema = HttpError.Schema
> extends FunctionRuntimeProps {
  input?: Input | Input[];
  output?: Output | Output[];
  errors?: Errors | Errors[];
}

export interface HttpRouteFactory {
  <Path extends string>(
    path: Path,
    handler: HttpHandler<Path, HttpRequest.Input<Path>>
  ): HttpRoute<Path, HttpRequest.Input<Path>>;
  <
    Path extends string,
    Input extends HttpRequest.Input<Path> = HttpRequest.DefaultInput<Path>,
    Output extends HttpResponse.Schema = HttpResponse.Schema,
    Errors extends HttpError.Schema = HttpError.Schema
  >(
    path: Path,
    props: HttpRouteProps<Path, Input, Output, Errors>,
    handler: HttpHandler<Path, Input, Output, Errors>
  ): HttpRoute<Path, Input, Output, Errors>;
}

export type HttpRoute<
  Path extends string,
  Input extends HttpRequest.Input<Path> = HttpRequest.Input<Path>,
  Output extends HttpResponse.Schema = HttpResponse.Schema,
  Errors extends HttpError.Schema = HttpError.Schema
> = {
  kind: "HttpRoute";
  path: Path;
  request: Input;
  response: Output;
  errors: Error;
} & HttpHandler<Path, Input, Output, Errors>;
