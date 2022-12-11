import itty from "itty-router";

export const api: Router = itty.Router() as any as Router;

export interface ApiRequest extends itty.Request {
  headers: Record<string, string | undefined>;
  json(): Promise<any>;
  blob(): Promise<Buffer | undefined>;
  text(): Promise<string | undefined>;
}

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => Response | Promise<Response>;

export type Route = (path: string, ...handlers: RouteHandler[]) => Router;

export interface Router {
  handle: (request: ApiRequest, ...extra: any) => Promise<Response>;
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
