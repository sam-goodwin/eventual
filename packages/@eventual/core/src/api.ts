import itty from "itty-router";
import { SourceLocation } from "./app-spec.js";
import { routes } from "./global.js";
import type { DurationSchedule } from "./schedule.js";

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

export interface ApiRequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
}

export class ApiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | Buffer | undefined;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;

  constructor(url: string, private props: ApiRequestInit) {
    const _url = new URL(url);
    this.method = props.method;
    this.headers = props.headers ?? {};
    this.body = props.body;
    if (props.query) {
      this.query = props.query;
    } else {
      const query: Record<string, string | string[]> = {};
      _url.searchParams.forEach((value, key) => {
        query[key] = value.includes(",") ? value.split(",") : value;
      });
      this.query = query;
    }
    this.params = props.params;
    this.url = _url.href;
  }

  async json() {
    return JSON.parse(await this.text());
  }

  async text() {
    if (this.props.body === undefined) {
      return "";
    } else if (typeof this.props.body === "string") {
      return JSON.parse(this.props.body);
    } else {
      // TODO: is this risky? Should we just fail whenever it's a base64 encoded buffer?
      // Or ... is this the best way to best-effort parse a buffer as JSON?
      return JSON.parse(this.props.body.toString("utf-8"));
    }
  }
}

export interface ApiResponse {
  status: number;
  body: string | Buffer | ReadableStream<Uint8Array> | null;
  headers?: Record<string, string> | Headers;
  json?(): Promise<any>;
  text?(): Promise<any>;
  arrayBuffer?(): Promise<any>;
}

/**
 * This models the Node Fetch API. We extract it to avoid coupling users to "dom" lib
 * or any particular node version, but we also want to support users who opt-in to
 * those.
 */
interface Headers {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(
    callbackfn: (value: string, key: string, parent: Headers) => void,
    thisArg?: any
  ): void;
}

export interface RouteRuntimeProps {
  memorySize: number;
  timeout?: DurationSchedule;
}

export enum HttpMethod {
  POST = "POST",
  GET = "GET",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
}

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
