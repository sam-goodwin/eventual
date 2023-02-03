import itty from "itty-router";

import type { SourceLocation } from "../app-spec.js";
import { routes } from "../global.js";
import type { HttpMethod } from "./method.js";
import { HttpRequest } from "./request.js";
import { HttpResponse } from "./response.js";

const router = itty.Router() as any as Router;

export type RouteEntry = [string, RegExp, HttpMethod.Handler];

export interface Route {
  path: string;
  handlers: HttpMethod.Handler[];
  method: HttpMethod;
  runtimeProps?: HttpMethod.Props;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface Router {
  handle: (
    request: HttpRequest.Payload,
    ...extra: any
  ) => Promise<HttpResponse.Payload>;
  routes: RouteEntry[];
  all: HttpMethod.Router;
  get: HttpMethod.Get.Router;
  head: HttpMethod.Router;
  post: HttpMethod.Router;
  put: HttpMethod.Router;
  delete: HttpMethod.Router;
  connect: HttpMethod.Router;
  options: HttpMethod.Router;
  trace: HttpMethod.Router;
  patch: HttpMethod.Router;
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
export const api: Router = new Proxy(
  {},
  {
    get: (_, method: keyof typeof router) => {
      if (method === "routes" || method === "handle") {
        return router[method];
      } else {
        return (
          ...args:
            | [SourceLocation, string, ...HttpMethod.Handler[]]
            | [
                SourceLocation,
                string,
                HttpMethod.Props,
                ...HttpMethod.Handler[]
              ]
            | [string, ...HttpMethod.Handler[]]
            | [string, HttpMethod.Props, ...HttpMethod.Handler[]]
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
              (a: any): a is HttpMethod.Handler => typeof a === "function"
            ) as HttpMethod.Handler[], // todo: why do i need to cast?
          };
          routes.push(route);
          // @ts-expect-error - functions don't overlap, but we know they can be called together
          return router[method](route.path, ...route.handlers);
        };
      }
    },
  }
) as any;
