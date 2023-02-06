import itty from "itty-router";

import { routes } from "../global.js";

import type { SourceLocation } from "../app-spec.js";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpError } from "./error.js";
import type { HttpHandler } from "./handler.js";
import type { HttpMethod } from "./method.js";
import type { RawHttpRequest } from "./raw.js";
import type { HttpRequest } from "./request.js";
import type { HttpResponse } from "./response.js";

const router = itty.Router() as any as HttpRouter;

export type RouteEntry = [string, RegExp, HttpHandler];

export interface HttpRouter {
  handle: (request: RawHttpRequest, ...extra: any) => Promise<HttpRoute>;
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
            | [SourceLocation, string, HttpHandler]
            | [SourceLocation, string, AnyHttpRouteProps, HttpHandler]
            | [string, HttpHandler]
            | [string, AnyHttpRouteProps, HttpHandler]
        ) => {
          const [sourceLocation, path, routeProps, handler] =
            typeof args[0] === "object"
              ? typeof args[3] === "function"
                ? (args as [
                    SourceLocation,
                    string,
                    AnyHttpRouteProps,
                    HttpHandler
                  ])
                : [
                    args[0] as SourceLocation,
                    args[1] as string,
                    undefined,
                    args[2] as HttpHandler,
                  ]
              : typeof args[2] === "function"
              ? [
                  undefined,
                  args[0],
                  args[1] as AnyHttpRouteProps,
                  args[2] as HttpHandler,
                ]
              : [undefined, args[0], undefined, args[1] as HttpHandler];
          const route: HttpRoute = {
            kind: "HttpRoute",
            path,
            method: method.toUpperCase() as HttpMethod,
            ...routeProps,
            sourceLocation,
            handler,
            input: routeProps?.input,
            output: coerceArray(routeProps?.output),
            errors: coerceArray(routeProps?.errors),
          };
          routes.push(route);
          return router[method](route.path, () => {
            // we return the matched route so that it can be intercepted by our api handler
            // the interceptor will check the request against the schema and perform any
            // upfront parsing.
            return route as any;
          });
        };
      }
    },
  }
) as any;

function coerceArray<T>(t: T | T[] | undefined) {
  return t ? (Array.isArray(t) ? t : [t]) : undefined;
}

type AnyHttpRouteProps = HttpRouteProps<
  string,
  HttpRequest.Schema<string>,
  HttpResponse.Schema,
  HttpError.Schema
>;

export interface HttpRouteProps<
  Path extends string,
  Input extends HttpRequest.Schema<Path>,
  Output extends HttpResponse.Schema,
  Errors extends HttpError.Schema
> extends FunctionRuntimeProps {
  input?: Input;
  output?: Output | Output[];
  errors?: Errors | Errors[];
}

export interface HttpRouteFactory {
  <Path extends string>(
    path: Path,
    handler: HttpHandler<Path, HttpRequest.Schema<Path>>
  ): HttpRoute<Path, HttpRequest.Schema<Path>>;
  <
    Path extends string,
    Input extends HttpRequest.Schema<Path>,
    Output extends HttpResponse.Schema,
    Errors extends HttpError.Schema = HttpError.Schema
  >(
    path: Path,
    props: HttpRouteProps<Path, Input, Output, Errors>,
    handler: HttpHandler<Path, Input, Output, Errors>
  ): HttpRoute<Path, Input, Output, Errors>;
}

export interface HttpRoute<
  Path extends string = string,
  Input extends HttpRequest.Schema<Path> = HttpRequest.Schema<Path>,
  Output extends HttpResponse.Schema = HttpResponse.Schema,
  Errors extends HttpError.Schema = HttpError.Schema
> extends FunctionRuntimeProps {
  kind: "HttpRoute";
  method: HttpMethod;
  path: Path;
  input?: Input;
  output?: Output[];
  errors?: Errors[];
  handler: HttpHandler<Path, Input, Output, Errors>;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}
