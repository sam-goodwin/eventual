import itty from "itty-router";
import type { SourceLocation } from "../service-spec.js";
import type { FunctionRuntimeProps } from "../function-props.js";
import { commands } from "../global.js";
import type { HttpMethod } from "../http-method.js";
import type { Command } from "./command.js";
import type { HttpRequest, HttpResponse } from "./request-response.js";

const router = itty.Router() as any as HttpRouter;

/**
 * This Proxy intercepts the method  being called, e.g. `get`, `post`, etc.
 * and includes that information in the created {@link HttpRoute} object. This
 * information is then picked up during infer so we know the HTTP method
 * for each route.
 *
 * It also includes `sourceLocation` (injected by the compiler), `path`, and
 * any `runtimeProps` passed in by the user.
 *
 * @see HttpRoute for all the metadata associated with each route
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
            | [SourceLocation, string, HttpHandler[]]
            | [SourceLocation, string, RouteRuntimeProps, HttpHandler[]]
            | [string, HttpHandler[]]
            | [string, RouteRuntimeProps, HttpHandler[]]
        ) => {
          const [sourceLocation, path, routeProps, handler] =
            typeof args[0] === "object"
              ? typeof args[3] === "function"
                ? (args as any as [
                    SourceLocation,
                    string,
                    RouteRuntimeProps,
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
                  args[1] as RouteRuntimeProps,
                  args[2] as HttpHandler,
                ]
              : [undefined, args[0], undefined, args[1] as HttpHandler];
          const command: Command = {
            kind: "Command",
            handler,
            memorySize: routeProps?.memorySize,
            method: method.toUpperCase() as HttpMethod,
            name: path,
            path: (typeof args[0] === "string" ? args[0] : args[1]) as string,
            sourceLocation,
            timeout: routeProps?.timeout,
            // we want the base HTTP request, not the transformed one
            passThrough: true,
          };
          commands.push(command as any);
          return router[method](path, command.handler);
        };
      }
    },
  }
) as any;

// alias api as http - potential rename?
export const http = api;

export interface RouteRuntimeProps extends FunctionRuntimeProps {}

export type HttpHandler = (
  request: HttpRequest,
  ...args: any
) => HttpResponse | Promise<HttpResponse>;

export interface HttpRoute {
  path: string;
  handlers: HttpHandler[];
  method: HttpMethod;
  runtimeProps?: RouteRuntimeProps;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface HttpRouteFactory {
  (
    path: string,
    props: RouteRuntimeProps,
    ...handlers: HttpHandler[]
  ): HttpRouter;
  (path: string, ...handlers: HttpHandler[]): HttpRouter;
}

export interface HttpRouter {
  handle: (request: HttpRequest, ...extra: any) => Promise<HttpResponse>;
  routes: HttpRouteEntry[];
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

export type HttpRouteEntry = [string, RegExp, HttpHandler];
