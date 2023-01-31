import itty from "itty-router";

export const api: Router = itty.Router() as any as Router;

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

export type Route = (path: string, ...handlers: RouteHandler[]) => Router;

export interface Router {
  handle: (request: ApiRequest, ...extra: any) => Promise<ApiResponse>;
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
