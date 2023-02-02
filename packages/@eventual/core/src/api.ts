import type z from "zod";
import itty from "itty-router";
import type {
  ApiRequest,
  ApiResponse,
  TypedApiRequest,
  TypedApiResponse,
} from "./api-request.js";
import { SourceLocation } from "./app-spec.js";
import { FunctionRuntimeProps } from "./function-props.js";
import { routes } from "./global.js";
import { HttpMethod } from "./http-method.js";

const router = itty.Router() as any as Router;

export interface Router {
  handle: (request: ApiRequest, ...extra: any) => Promise<ApiResponse>;
  routes: RouteEntry[];
  all: RouteFactory;
  get: GetRouteFactory;
  head: RouteFactory;
  post: RouteFactory;
  put: RouteFactory;
  delete: RouteFactory;
  connect: RouteFactory;
  options: RouteFactory;
  trace: RouteFactory;
  patch: RouteFactory;
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

type ParamValue = string | number | boolean;

export interface ParamsSchema {
  [parameterName: string]: z.ZodType<ParamValue | ParamValue[]>;
}

export interface ParamValues {
  [parameterName: string]: ParamValue | ParamValue[];
}

export interface HeadersSchema {
  [headerName: string]: z.ZodType<undefined | string | string[]>;
}

export interface HeaderValues {
  [headerName: string]: string | string[] | undefined;
}

export interface RouteRuntimeProps<
  Input extends z.ZodType = z.ZodAny,
  Output extends z.ZodType = z.ZodAny,
  Headers extends HeadersSchema | undefined = undefined,
  Params extends ParamsSchema | undefined = undefined,
  OutputHeaders extends HeadersSchema | undefined = undefined
> extends FunctionRuntimeProps {
  input?: Input;
  headers?: Headers;
  params?: Params;
  output?: Output;
  outputHeaders?: OutputHeaders;
}

export interface GetRouteRuntimeProps<
  Output extends z.ZodType = z.ZodAny,
  Headers extends HeadersSchema | undefined = undefined,
  Params extends ParamsSchema | undefined = undefined,
  OutputHeaders extends HeadersSchema | undefined = undefined
> extends FunctionRuntimeProps {
  headers?: Headers;
  params?: Params;
  output?: Output;
  outputHeaders?: OutputHeaders;
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

export interface GetApi<
  Output,
  Headers extends HeaderValues | undefined,
  Params extends ParamValues | undefined,
  OutputHeaders extends HeaderValues | undefined
> extends Api<undefined, Output, Headers, Params, OutputHeaders> {}

export interface Api<
  Input = any,
  Output = any,
  Headers extends HeaderValues | undefined = undefined,
  Params extends ParamValues | undefined = undefined,
  OutputHeaders extends HeaderValues | undefined = undefined
> {
  kind: "Api";
  (request: TypedApiRequest<Input, Headers, Params>): Promise<
    TypedApiResponse<Output, OutputHeaders>
  >;
}

export interface RouteFactory {
  <
    Input extends z.ZodType,
    Output extends z.ZodType,
    Headers extends HeadersSchema | undefined,
    Params extends ParamsSchema | undefined,
    OutputHeaders extends HeadersSchema | undefined
  >(
    path: string,
    props: RouteRuntimeProps<Input, Output, Headers, Params>,
    ...handlers: RouteHandler[]
  ): Api<
    z.infer<Input>,
    z.infer<Output>,
    undefined extends Headers
      ? HeaderValues
      : z.infer<z.ZodObject<Exclude<Headers, undefined>>>,
    Params extends undefined
      ? ParamValues
      : z.infer<z.ZodObject<Exclude<Params, undefined>>>,
    undefined extends OutputHeaders
      ? HeaderValues
      : z.infer<z.ZodObject<Exclude<OutputHeaders, undefined>>>
  >;
  (path: string, ...handlers: RouteHandler[]): Api<
    any,
    any,
    HeaderValues,
    ParamValues,
    HeaderValues
  >;
}

export interface GetRouteFactory {
  <
    Output extends z.ZodType,
    Headers extends HeadersSchema | undefined,
    Params extends ParamsSchema | undefined,
    OutputHeaders extends HeadersSchema | undefined
  >(
    path: string,
    props: GetRouteRuntimeProps<Output, Headers, Params>,
    ...handlers: RouteHandler[]
  ): GetApi<
    z.infer<Output>,
    undefined extends Headers
      ? HeaderValues
      : z.infer<z.ZodObject<Exclude<Headers, undefined>>>,
    Params extends undefined
      ? ParamValues
      : z.infer<z.ZodObject<Exclude<Params, undefined>>>,
    OutputHeaders extends undefined
      ? HeaderValues
      : z.infer<z.ZodObject<Exclude<OutputHeaders, undefined>>>
  >;
  (path: string, ...handlers: RouteHandler[]): GetApi<
    any,
    HeaderValues,
    ParamValues,
    HeaderValues
  >;
}

export type RouteEntry = [string, RegExp, RouteHandler];
