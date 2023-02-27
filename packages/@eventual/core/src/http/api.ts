import itty from "itty-router";
import type z from "zod";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import { commands } from "../internal/global.js";
import type { SourceLocation } from "../internal/service-spec.js";
import {
  command,
  Command,
  CommandHandler,
  parseCommandArgs,
  RestParams,
} from "./command.js";
import type {
  Middleware,
  MiddlewareInput,
  MiddlewareOutput,
} from "./middleware.js";
import type { HttpRequest, HttpResponse } from "./request-response.js";

const router = itty.Router() as any as HttpRouter<{}>;

/**
 * This Proxy intercepts the method  being called, e.g. `get`, `post`, etc.
 * and includes that information in the created {@link HttpRoute} object. This
 * information is then picked up during infer so we know the HTTP method
 * for each route.
 *
 * It also includes `sourceLocation` (injected by the compiler), `path`, and
 * any `runtimeProps` passed in by the user.
 *
 * @see HttpRoute for all the metadata associated with each route
 */
export const api: HttpRouter<{}> = createRouter([]);

function createRouter<Context>(
  middlewares?: Middleware<any, any>[]
): HttpRouter<Context> {
  return new Proxy(
    {},
    {
      get: (_, method: keyof typeof router) => {
        if (method === "routes" || method === "handle") {
          return router[method];
        } else if (method === "use") {
          return (middleware: Middleware<any, any>) =>
            createRouter([...(middlewares ?? []), middleware]);
        } else if (method === "command") {
          return (...args: any[]) => {
            const [sourceLocation, name, options, handler] =
              parseCommandArgs(args);
            return (command as any)(
              sourceLocation,
              name,
              {
                ...(options ?? {}),
                middlewares,
              },
              handler
            );
          };
        } else {
          return (
            ...args:
              | [SourceLocation, string, HttpHandler[]]
              | [SourceLocation, string, RouteRuntimeProps, HttpHandler[]]
              | [string, HttpHandler[]]
              | [string, RouteRuntimeProps, HttpHandler[]]
          ) => {
            const [sourceLocation, path, routeProps, handler] =
              typeof args[0] === "object"
                ? typeof args[3] === "function"
                  ? (args as any as [
                      SourceLocation,
                      string,
                      RouteRuntimeProps,
                      HttpHandler
                    ])
                  : [
                      args[0] as SourceLocation,
                      args[1] as string,
                      undefined,
                      args[2] as HttpHandler,
                    ]
                : typeof args[2] === "function"
                ? [
                    undefined,
                    args[0],
                    args[1] as RouteRuntimeProps,
                    args[2] as HttpHandler,
                  ]
                : [undefined, args[0], undefined, args[1] as HttpHandler];
            const command: Command = {
              kind: "Command",
              handler,
              memorySize: routeProps?.memorySize,
              method: method.toUpperCase() as HttpMethod,
              name: path,
              path: (typeof args[0] === "string" ? args[0] : args[1]) as string,
              sourceLocation,
              handlerTimeout: routeProps?.handlerTimeout,
              middlewares,
              // we want the base HTTP request, not the transformed one
              passThrough: true,
            };
            commands.push(command as any);

            return router[method](path, command.handler);
          };
        }
      },
    }
  ) as any;
}

export interface RouteRuntimeProps extends FunctionRuntimeProps {}

export type HttpHandler<Context = any> = (
  request: HttpRequest,
  context: Context
) => HttpResponse | Promise<HttpResponse>;

export interface HttpRoute {
  path: string;
  handlers: HttpHandler<any>[];
  method: HttpMethod;
  runtimeProps?: RouteRuntimeProps;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface HttpRouteFactory<Context> {
  (
    path: string,
    props: RouteRuntimeProps,
    handlers: HttpHandler<Context>
  ): HttpRouter<Context>;
  (path: string, handlers: HttpHandler<Context>): HttpRouter<Context>;
}

export interface HttpRouter<Context> {
  handle: (request: HttpRequest, ...extra: any) => Promise<HttpResponse>;
  routes: HttpRouteEntry[];
  all: HttpRouteFactory<Context>;
  get: HttpRouteFactory<Context>;
  head: HttpRouteFactory<Context>;
  post: HttpRouteFactory<Context>;
  put: HttpRouteFactory<Context>;
  delete: HttpRouteFactory<Context>;
  connect: HttpRouteFactory<Context>;
  options: HttpRouteFactory<Context>;
  trace: HttpRouteFactory<Context>;
  patch: HttpRouteFactory<Context>;
  use<NextContext>(
    middleware: (
      input: MiddlewareInput<Context>
    ) => Promise<MiddlewareOutput<NextContext>> | MiddlewareOutput<NextContext>
  ): HttpRouter<NextContext>;

  command<
    Name extends string,
    Handler extends CommandHandler<any, any, Context>
  >(
    name: Name,
    handler: Handler
  ): Command<Name, Handler, undefined, undefined>;

  command<
    Name extends string,
    Input,
    Output,
    Path extends string | undefined,
    Method extends HttpMethod | undefined,
    Handler extends CommandHandler<Input, Output, Context>
  >(
    name: Name,
    options: FunctionRuntimeProps & {
      path?: Path;
      method?: Method;
      params?: RestParams<Input, Path, Method>;
      input: z.ZodType<Input>;
      output?: z.ZodType<Output>;
      /**
       * Enable or disable schema validation.
       *
       * @default true
       */
      validate?: boolean;
    },
    handler: Handler
  ): Command<Name, Handler, Path, Method>;

  command<
    Name extends string,
    Path extends string | undefined,
    Method extends HttpMethod | undefined,
    Handler extends CommandHandler<any, any, Context>
  >(
    name: Name,
    options: FunctionRuntimeProps & {
      path?: Path;
      method?: Method;
      params?: RestParams<Parameters<Handler>[0], Path, Method>;
      input?: undefined;
      /**
       * Enable or disable schema validation.
       *
       * @default true
       */
      validate?: boolean;
    },
    handler: Handler
  ): Command<Name, Handler, Path, Method>;
}

export type HttpRouteEntry = [string, RegExp, HttpHandler];
