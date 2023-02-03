import itty from "itty-router";
import { ApiRequest, ApiResponse } from "./api-request.js";
import { FunctionRuntimeProps } from "./function-props.js";
import { routes } from "./global.js";
import { HttpMethod } from "./http-method.js";
import { SourceLocation } from "./service-spec.js";

const router = itty.Router() as any as Router;

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
export const api: Router = new Proxy(
  {},
  {
    get: (_, method: keyof typeof router) => {
      if (method === "routes" || method === "handle") {
        return router[method];
      } else {
        return (
          ...args:
            | [SourceLocation, string, ...RouteHandler[]]
            | [SourceLocation, string, RouteRuntimeProps, ...RouteHandler[]]
            | [string, ...RouteHandler[]]
            | [string, RouteRuntimeProps, ...RouteHandler[]]
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
              (a: any): a is RouteHandler => typeof a === "function"
            ) as RouteHandler[], // todo: why do i need to cast?
          };
          routes.push(route);
          return router[method](route.path, ...route.handlers);
        };
      }
    },
  }
) as any;

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => ApiResponse | Promise<ApiResponse>;

export interface RouteRuntimeProps extends FunctionRuntimeProps {}

export interface Route {
  path: string;
  handlers: RouteHandler[];
  method: HttpMethod;
  runtimeProps?: RouteRuntimeProps;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface RouteFactory {
  (path: string, props: RouteRuntimeProps, ...handlers: RouteHandler[]): Router;
  (path: string, ...handlers: RouteHandler[]): Router;
}

export interface Router {
  handle: (request: ApiRequest, ...extra: any) => Promise<ApiResponse>;
  routes: RouteEntry[];
  all: RouteFactory;
  get: RouteFactory;
  head: RouteFactory;
  post: RouteFactory;
  put: RouteFactory;
  delete: RouteFactory;
  connect: RouteFactory;
  options: RouteFactory;
  trace: RouteFactory;
  patch: RouteFactory;
}

export type RouteEntry = [string, RegExp, RouteHandler];
