import itty from "itty-router";
import { Readable } from "node:stream";
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

abstract class BaseApiObject {
  abstract readonly body: string | Buffer | Readable | null;

  async json() {
    return JSON.parse((await this.text?.()) ?? "");
  }

  async text(): Promise<string> {
    if (this.body === undefined) {
      return "";
    } else if (typeof this.body === "string") {
      return this.body;
    } else if (Buffer.isBuffer(this.body)) {
      // TODO: is this risky? Should we just fail whenever it's a base64 encoded buffer?
      // Or ... is this the best way to best-effort parse a buffer as JSON?
      return this.body.toString("utf-8");
    } else {
      return Buffer.from((await readStream(this.body)).buffer).toString(
        "utf-8"
      );
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.body === undefined) {
      return new ArrayBuffer(0);
    } else if (typeof this.body === "string") {
      return Buffer.from(this.body, "utf8");
    } else if (Buffer.isBuffer(this.body)) {
      return this.body;
    } else {
      return readStream(this.body);
    }
  }
}

export interface ApiRequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string | Buffer | null;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
}

export class ApiRequest extends BaseApiObject {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | Buffer | null;
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string | string[]>;

  constructor(url: string, props: ApiRequestInit) {
    super();
    const _url = new URL(url);
    this.method = props.method;
    this.headers = props.headers ?? {};
    this.body = props.body ?? null;
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
}

export type Body = string | Buffer | Readable | null;

export class ApiResponse extends BaseApiObject {
  readonly body: Body;
  readonly status: number;
  readonly statusText?: string;
  readonly headers?: Record<string, string> | Headers;
  constructor(
    body?: Body,
    init?: {
      status: number;
      statusText?: string;
      headers?: Record<string, string> | Headers;
    }
  ) {
    super();
    this.body = body === undefined ? null : body;
    this.status = init?.status ?? 200;
    this.statusText = init?.statusText;
    this.headers = init?.headers;
  }
}

async function readStream(readable?: Readable | null): Promise<Buffer> {
  if (!readable) {
    return Buffer.from(new Uint8Array(0));
  }

  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    readable.on("error", reject);
    readable.on("data", (data) => {
      chunks.push(data);
    });
    readable.on("close", () => resolve(Buffer.concat(chunks)));
  });
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
