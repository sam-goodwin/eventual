import type { FunctionRuntimeProps } from "../function-props.js";
import { CallKind, createCall, type SocketCall } from "../internal/calls.js";
import {
  createEventualProperty,
  PropertyKind,
  type SocketUrlsProperty,
} from "../internal/properties.js";
import { registerEventualResource } from "../internal/resources.js";
import { isSourceLocation, type SocketSpec } from "../internal/service-spec.js";
import { parseArgs } from "../internal/util.js";
import type { ServiceContext } from "../service.js";
import type { SocketMiddleware } from "./middleware.js";

export interface SocketHandlerContext {
  socket: { socketName: string };
  service: ServiceContext;
}

export type SocketHeaders = Record<string, string | undefined>;
export type SocketQuery = Record<string, string | undefined>;
export interface SocketConnectionRequest {
  connectionId: string;
  query?: SocketQuery;
  headers: SocketHeaders;
}

export interface SocketResponse {
  status: number;
  message?: string | Buffer | any;
}

export type SocketHandlers<
  ConnectContext extends SocketHandlerContext = SocketHandlerContext
> = {
  $connect: (
    request: SocketConnectionRequest,
    context: ConnectContext
  ) => Promise<SocketResponse | void> | SocketResponse | void;
  $disconnect: (
    request: { connectionId: string },
    context: SocketHandlerContext
  ) => Promise<SocketResponse | void> | SocketResponse | void;
  $default: (
    request: {
      connectionId: string;
      body?: string;
      headers?: SocketHeaders;
    },
    context: SocketHandlerContext
  ) =>
    | Promise<SocketResponse | string | Buffer | any | void>
    | SocketResponse
    | string
    | Buffer
    | any
    | void;
};

export type Socket<
  Name extends string = string,
  ConnectContext extends SocketHandlerContext = SocketHandlerContext
> = SocketSpec<Name> & {
  kind: "Socket";
  handlers: SocketHandlers<ConnectContext>;
  wssEndpoint: string;
  httpEndpoint: string;
  connectMiddlewares: SocketMiddleware<any, any>[];
} & {
  send: (connectionId: string, input: Buffer | string) => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
};

export type SocketOptions = FunctionRuntimeProps;

export interface socket<
  Context extends SocketHandlerContext = SocketHandlerContext
> {
  middlewares: SocketMiddleware<any, any>[];
  use<NextContext extends Context = Context>(
    socketMiddleware: SocketMiddleware<Context, NextContext>
  ): socket<NextContext>;
  <Name extends string>(
    name: Name,
    options: SocketOptions,
    handlers: SocketHandlers<Context>
  ): Socket<Name, Context>;
  <Name extends string>(name: Name, handlers: SocketHandlers<Context>): Socket<
    Name,
    Context
  >;
}

function createSocketBuilder<
  Context extends SocketHandlerContext = SocketHandlerContext
>(middlewares: SocketMiddleware<any, any>[]): socket<Context> {
  const socketFunction = <Name extends string>(
    ...args:
      | [name: Name, options: SocketOptions, handlers: SocketHandlers]
      | [name: Name, handlers: SocketHandlers]
  ): Socket<Name> => {
    const { sourceLocation, name, options, handlers } =
      parseSocketArgs<Name>(args);
    const socket = {
      connectMiddlewares: middlewares,
      name,
      handlers,
      sourceLocation,
      kind: "Socket",
      handlerTimeout: options?.handlerTimeout,
      memorySize: options?.memorySize,
      get wssEndpoint() {
        return getEventualHook().getEventualProperty<SocketUrlsProperty>(
          createEventualProperty(PropertyKind.SocketUrls, { socketName: name })
        ).wss;
      },
      get httpEndpoint() {
        return getEventualHook().getEventualProperty<SocketUrlsProperty>(
          createEventualProperty(PropertyKind.SocketUrls, { socketName: name })
        ).http;
      },
      send(...params) {
        return getEventualHook().executeEventualCall(
          createCall<SocketCall>(CallKind.SocketCall, {
            operation: {
              operation: "send",
              socketName: name,
              params,
            },
          })
        );
      },
      disconnect(...params) {
        return getEventualHook().executeEventualCall(
          createCall<SocketCall>(CallKind.SocketCall, {
            operation: {
              operation: "disconnect",
              socketName: name,
              params,
            },
          })
        );
      },
    } as Socket<Name>;

    return registerEventualResource("Socket", socket as any) as Socket<Name>;
  };
  const useFunction: socket<Context>["use"] = <NextContext extends Context>(
    socketMiddleware: SocketMiddleware<Context, NextContext>
  ) => createSocketBuilder<NextContext>([...middlewares, socketMiddleware]);
  (socketFunction as socket).use = useFunction;

  return socketFunction as unknown as socket<Context>;
}

export const socket = createSocketBuilder([]);

export function parseSocketArgs<Name extends string>(args: any[]) {
  return parseArgs(args, {
    sourceLocation: isSourceLocation,
    name: (a: any): a is Name => typeof a === "string",
    options: (a: any): a is SocketOptions =>
      typeof a === "object" && !isSourceLocation(a) && !("$connect" in a),
    handlers: (a: any): a is SocketHandlers =>
      typeof a === "object" && !isSourceLocation(a) && "$connect" in a,
  });
}
