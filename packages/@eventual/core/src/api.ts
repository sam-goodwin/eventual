import itty from "itty-router";

export const api: Router = itty.Router() as any as Router;

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => ApiResponse | Promise<ApiResponse>;

export interface ApiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | Buffer | undefined;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  json(): Promise<any>;
  text(): Promise<any>;
  arrayBuffer?(): Promise<any>;
  blob?(): Promise<any>;
  formData?(): Promise<any>;
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
