import itty from "itty-router";
import type openapi from "openapi3-ts";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import {
  getEnvironmentManifest,
  registerEventualResource,
} from "../internal/global.js";
import { generateOpenAPISpec } from "../internal/open-api-spec.js";
import type { SourceLocation } from "../internal/service-spec.js";
import {
  AnyCommand,
  Command,
  CommandContext,
  CommandHandler,
  CommandOptions,
  CommandOutputOptions,
  command,
  parseCommandArgs,
} from "./command.js";
import type {
  Middleware,
  MiddlewareInput,
  MiddlewareOutput,
} from "./middleware.js";
import type { HttpRequest, HttpResponse } from "./request-response.js";

const router = itty.Router() as any as HttpRouter<CommandContext>;

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
export const api: HttpRouter<CommandContext> = createRouter([]);

function createRouter<Context extends CommandContext>(
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
              | [SourceLocation, string, ApiRouteProps, HttpHandler[]]
              | [string, HttpHandler[]]
              | [string, ApiRouteProps, HttpHandler[]]
          ) => {
            const [sourceLocation, path, routeProps, handler] =
              typeof args[0] === "object"
                ? typeof args[3] === "function"
                  ? (args as any as [
                      SourceLocation,
                      string,
                      ApiRouteProps,
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
                    args[1] as ApiRouteProps,
                    args[2] as HttpHandler,
                  ]
                : [undefined, args[0], undefined, args[1] as HttpHandler];
            const command: AnyCommand = {
              description: routeProps?.description,
              kind: "Command",
              handler,
              memorySize: routeProps?.memorySize,
              method: method.toUpperCase() as HttpMethod,
              name: path,
              path: (typeof args[0] === "string" ? args[0] : args[1]) as string,
              sourceLocation,
              handlerTimeout: routeProps?.handlerTimeout,
              middlewares,
              otherOutputs: routeProps?.outputs,
              // we want the base HTTP request, not the transformed one
              passThrough: true,
            };
            registerEventualResource("commands", command);

            return router[method](path, command.handler);
          };
        }
      },
    }
  ) as any;
}

export type RouteRuntimeProps = FunctionRuntimeProps;

export interface ApiRouteProps extends RouteRuntimeProps {
  /**
   * Description of the route.
   *
   * Used to generate the {@link ApiSpecification}.
   */
  description?: string;
  /**
   * Outputs of the route.
   *
   * Used to generate the {@link ApiSpecification}.
   */
  outputs?: CommandOutputOptions<any>[];
}

export type HttpHandler<Context extends CommandContext = CommandContext> = (
  request: HttpRequest,
  context: Context
) => HttpResponse | Promise<HttpResponse>;

export interface HttpRoute {
  path: string;
  handlers: HttpHandler<any>[];
  method: HttpMethod;
  props?: ApiRouteProps;
  /**
   * Only available during eventual-infer
   */
  sourceLocation?: SourceLocation;
}

export interface HttpRouteFactory<Context extends CommandContext> {
  (
    path: string,
    props: ApiRouteProps,
    handlers: HttpHandler<Context>
  ): HttpRouter<Context>;
  (path: string, handlers: HttpHandler<Context>): HttpRouter<Context>;
}

export interface HttpRouter<Context extends CommandContext> {
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
  use<NextContext extends CommandContext>(
    middleware: (
      input: MiddlewareInput<Context>
    ) => Promise<MiddlewareOutput<NextContext>> | MiddlewareOutput<NextContext>
  ): HttpRouter<NextContext>;

  command<Name extends string, Input = undefined, Output = void>(
    name: Name,
    handler: CommandHandler<Input, Output, Context>
  ): Command<Name, Input, Output, Context, undefined, undefined>;

  command<
    Name extends string,
    Input,
    Output,
    Path extends string | undefined,
    Method extends HttpMethod | undefined
  >(
    name: Name,
    options: CommandOptions<Input, Output, Path, Method>,
    handler: CommandHandler<Input, Output, Context>
  ): Command<Name, Input, Output, Context, Path, Method>;
}

export type HttpRouteEntry = [string, RegExp, HttpHandler];

export interface ApiSpecification {
  generate: (options?: { includeRpcPaths?: boolean }) => openapi.OpenAPIObject;
}

export const ApiSpecification: ApiSpecification = {
  generate: (options) => {
    const envManifest = getEnvironmentManifest();
    if (!envManifest) {
      throw new Error("EnvironmentManifest has not been registered.");
    }
    return generateOpenAPISpec(envManifest.serviceSpec.commands, {
      createRestPaths: true,
      createRpcPaths: options?.includeRpcPaths ?? false,
      info: envManifest.serviceSpec.openApi.info,
      servers: [{ url: envManifest.serviceUrl }],
    });
  },
};
