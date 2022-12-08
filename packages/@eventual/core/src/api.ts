import itty from "itty-router";

export const api: Router = itty.Router() as any as Router;

export type RouteHandler = (
  request: itty.Request,
  ...args: any
) => Response | Promise<Response>;

export type Route = (path: string, ...handlers: RouteHandler[]) => Router;

export interface Router {
  handle: (request: itty.Request, ...extra: any) => Promise<Response>;
  routes: RouteEntry[];
  all: Route;
  get: Route;
  head: Route;
  post: Route;
  put: Route;
  delete: Route;
  connect: Route;
  options: Route;
  trace: Route;
  patch: Route;
}

export type RouteEntry = [string, RegExp, RouteHandler];
