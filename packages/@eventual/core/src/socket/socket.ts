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
import type {
  SocketMiddleware,
  SocketMiddlewareFunction,
} from "./middleware.js";

export interface SocketContext<
  ConnectContext extends SocketHandlerContext = SocketHandlerContext,
  DisconnectContext extends SocketHandlerContext = SocketHandlerContext,
  MessageContext extends SocketHandlerContext = SocketHandlerContext
> {
  connect: ConnectContext;
  disconnect: DisconnectContext;
  message: MessageContext;
}

export interface SocketHandlerContext {
  socket: { socketName: string };
  service: ServiceContext;
}

export type SocketHeaders = Record<string, string | undefined>;
export type SocketQuery = Record<string, string | undefined>;
export type SocketRequest =
  | SocketConnectRequest
  | SocketDisconnectRequest
  | SocketMessageRequest;

export interface SocketConnectRequest {
  type: "connect";
  connectionId: string;
  query?: SocketQuery;
  headers: SocketHeaders;
}

export interface SocketDisconnectRequest {
  type: "disconnect";
  connectionId: string;
}

export interface SocketMessageRequest {
  type: "message";
  connectionId: string;
  body?: string | Buffer;
}

export interface SocketResponse {
  status: number;
  message?: string | Buffer | any;
}

export type SocketHandlers<Context extends SocketContext = SocketContext> = {
  $connect: (
    request: SocketConnectRequest,
    context: Context["connect"]
  ) => Promise<SocketResponse | void> | SocketResponse | void;
  $disconnect: (
    request: SocketDisconnectRequest,
    context: Context["disconnect"]
  ) => Promise<SocketResponse | void> | SocketResponse | void;
  $default: (
    request: SocketMessageRequest,
    context: Context["message"]
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
  Context extends SocketContext = SocketContext
> = SocketSpec<Name> & {
  kind: "Socket";
  handlers: SocketHandlers<Context>;
  wssEndpoint: string;
  httpEndpoint: string;
  middlewares: SocketMiddleware[];
} & {
  send: (connectionId: string, input: Buffer | string) => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
};

export type SocketOptions = FunctionRuntimeProps;

export interface SocketRouter<Context extends SocketContext = SocketContext> {
  middlewares: SocketMiddleware[];
  use<
    NextConnectContext extends SocketHandlerContext = Context["connect"],
    NextDisconnectContext extends SocketHandlerContext = Context["disconnect"],
    NextMessageContext extends SocketHandlerContext = Context["message"]
  >(
    socketMiddleware:
      | SocketMiddleware<
          Context,
          SocketContext<
            NextConnectContext,
            NextDisconnectContext,
            NextMessageContext
          >
        >
      | SocketMiddlewareFunction<
          SocketConnectRequest,
          Context["connect"],
          NextConnectContext
        >
  ): SocketRouter<
    SocketContext<NextConnectContext, NextDisconnectContext, NextMessageContext>
  >;
  socket<Name extends string>(
    name: Name,
    options: SocketOptions,
    handlers: SocketHandlers<Context>
  ): Socket<Name, Context>;
  socket<Name extends string>(
    name: Name,
    handlers: SocketHandlers<Context>
  ): Socket<Name, Context>;
}

export interface socket<Context extends SocketContext = SocketContext>
  extends SocketRouter<Context> {
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

function createSocketFunction<Context extends SocketContext = SocketContext>(
  middlewares: SocketMiddleware[]
) {
  return <Name extends string>(
    ...args:
      | [name: Name, options: SocketOptions, handlers: SocketHandlers<Context>]
      | [name: Name, handlers: SocketHandlers<Context>]
  ): Socket<Name> => {
    const { sourceLocation, name, options, handlers } =
      parseSocketArgs<Name>(args);
    const socket = {
      middlewares,
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
}

function createUseFunction<Context extends SocketContext = SocketContext>(
  middlewares: SocketMiddleware[]
): SocketRouter<Context>["use"] {
  return <NextContext extends SocketContext = Context>(
    socketMiddleware:
      | SocketMiddleware<Context, NextContext>
      | SocketMiddlewareFunction<
          SocketConnectRequest,
          Context["connect"],
          NextContext["connect"]
        >
  ) => {
    const middleware: SocketMiddleware =
      typeof socketMiddleware === "function"
        ? { connect: socketMiddleware }
        : socketMiddleware;
    return createSocketRouter<NextContext>([...middlewares, middleware]);
  };
}

function createSocketRouter<Context extends SocketContext = SocketContext>(
  middlewares: SocketMiddleware[]
): SocketRouter<Context> {
  return {
    middlewares,
    use: createUseFunction<Context>(middlewares),
    socket: createSocketFunction<Context>(middlewares),
  };
}

function createSocketBuilder<
  Context extends SocketContext = SocketContext
>(): socket<Context> {
  const socketFunction = createSocketFunction<Context>([]);
  const useFunction = createUseFunction<Context>([]);
  (socketFunction as unknown as socket<Context>).use = useFunction;

  return socketFunction as unknown as socket<Context>;
}

export const socket = createSocketBuilder();

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
