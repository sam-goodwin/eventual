import itty from "itty-router";
import { SourceLocation } from "./app-spec.js";
import { routes } from "./global.js";
import type { DurationSchedule } from "./schedule.js";

const router = itty.Router() as any as Router;

export const api: Router = new Proxy(
  {},
  {
    get: (_, prop: keyof typeof router) => {
      if (prop === "routes") {
        return router.routes;
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
          return route;
        };
      }
    },
  }
) as any;

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => Response | Promise<Response>;

export interface ApiRequest extends Request {
  query?: Record<string, string>;
  params?: Record<string, string>;
}

export interface RouteRuntimeProps {
  memorySize: number;
  timeout?: DurationSchedule;
}

export interface Route {
  path: string;
  handlers: RouteHandler[];
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
  handle: (request: ApiRequest, ...extra: any) => Promise<Response>;
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
