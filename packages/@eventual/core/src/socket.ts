import type { FunctionRuntimeProps } from "./function-props.js";
import { CallKind, createCall, type SocketCall } from "./internal/calls.js";
import {
  createEventualProperty,
  PropertyKind,
  SocketUrlsProperty,
} from "./internal/properties.js";
import { registerEventualResource } from "./internal/resources.js";
import { isSourceLocation, type SocketSpec } from "./internal/service-spec.js";
import { parseArgs } from "./internal/util.js";
import type { ServiceContext } from "./service.js";

export interface SocketHandlerContext {
  socket: { socketName: string };
  service: ServiceContext;
}

export type SocketHandlers = {
  $connect: (
    request: {
      connectionId: string;
      query?: Record<string, string | undefined>;
    },
    context: SocketHandlerContext
  ) => Promise<void> | void;
  $disconnect: (
    request: { connectionId: string },
    context: SocketHandlerContext
  ) => Promise<void> | void;
  $default: (
    request: {
      connectionId: string;
      body?: string;
      headers?: Record<string, string | undefined>;
    },
    context: SocketHandlerContext
  ) => Promise<string | Buffer | any | void> | string | Buffer | any | void;
};

export type Socket<Name extends string = string> = SocketSpec<Name> & {
  kind: "Socket";
  handlers: SocketHandlers;
  wssEndpoint: string;
  httpEndpoint: string;
} & {
  send: (connectionId: string, input: Buffer | string) => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
};

export type SocketOptions = FunctionRuntimeProps;

export function socket<Name extends string>(
  ...args:
    | [name: Name, options: SocketOptions, handlers: SocketHandlers]
    | [name: Name, handlers: SocketHandlers]
): Socket<Name> {
  const { sourceLocation, name, options, handlers } =
    parseSocketArgs<Name>(args);
  const socket = {
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
}

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
