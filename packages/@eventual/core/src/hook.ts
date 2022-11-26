import itty from "itty-router";

const hooks: Hook[] = ((globalThis as any).hooks =
  (globalThis as any).hooks ?? []);

export function hook(setup: Hook) {
  hooks.push(setup);
}

export function getHooks() {
  return hooks.slice();
}

export type Hook = (router: Router) => void;

export function createRouter(): Router {
  return itty.Router() as any as Router;
}

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
