import { z } from "zod";
import { FunctionRuntimeProps } from "./function-props.js";
import { registerEventualResource } from "./internal/resources.js";
import { isSourceLocation, type SocketSpec } from "./internal/service-spec.js";
import { parseArgs } from "./internal/util.js";

export type SocketHandlers<
  IncomingRoutes extends Record<string, { Input: any; Output: any }>,
  ConnectQuery extends Record<string, any>
> = {
  $connect: (connectId: string, query: ConnectQuery) => Promise<void> | void;
  $disconnect: (connectId: string) => Promise<void> | void;
  $default: <Route extends keyof IncomingRoutes>(
    routeKey: Route,
    connectionId: string,
    body: IncomingRoutes[Route]["Input"]
  ) => Promise<IncomingRoutes[Route]["Output"]>;
} & {
  [routeKey in keyof IncomingRoutes]?: (
    connectId: string,
    body: IncomingRoutes[routeKey]["Input"]
  ) => Promise<IncomingRoutes[routeKey]["Output"]>;
};

export type Socket<
  Name extends string = string,
  IncomingRoutes extends Record<string, { Input: any; Output: any }> = Record<
    string,
    { Input: any; Output: any }
  >,
  OutgoingRoutes extends Record<string, any> = Record<string, any>,
  ConnectQuery extends Record<string, any> = Record<string, any>
> = SocketSpec<Name> & {
  kind: "Socket";
  handlers: SocketHandlers<IncomingRoutes, ConnectQuery>;
} & {
  send: (connectionId: string, input: Buffer | string) => Promise<void>;
} & {
  [route in Omit<keyof OutgoingRoutes, "send">]: (
    connectionId: string,
    input: OutgoingRoutes[route]
  ) => Promise<void>;
};

export interface SocketOptions<OutgoingActions extends Record<string, any>>
  extends FunctionRuntimeProps {
  outgoingActions: {
    [action in keyof OutgoingActions]: z.ZodType<OutgoingActions[action]>;
  };
}

export function socket<
  Name extends string,
  IncomingActions extends Record<string, { Input: any; Output: any }>,
  OutgoingActions extends Record<string, any>,
  ConnectQuery extends Record<string, any>
>(
  ...args:
    | [
        name: Name,
        options: SocketOptions<OutgoingActions>,
        handlers: SocketHandlers<IncomingActions, ConnectQuery>
      ]
    | [name: Name, handlers: SocketHandlers<IncomingActions, ConnectQuery>]
): Socket<Name, IncomingActions, OutgoingActions, ConnectQuery> {
  const { sourceLocation, name, options, handlers } = parseSocketArgs<
    Name,
    IncomingActions,
    ConnectQuery
  >(args);
  const socket = {
    name,
    handlers,
    sourceLocation,
    kind: "Socket",
    handlerTimeout: options?.handlerTimeout,
    memorySize: options?.memorySize,
  } as Socket<Name, IncomingActions, OutgoingActions, ConnectQuery>;

  return registerEventualResource("Socket", socket as any) as Socket<
    Name,
    IncomingActions,
    OutgoingActions,
    ConnectQuery
  >;
}

export function parseSocketArgs<
  Name extends string,
  IncomingRoutes extends Record<string, { Input: any; Output: any }>,
  ConnectQuery extends Record<string, any>
>(args: any[]) {
  return parseArgs(args, {
    sourceLocation: isSourceLocation,
    name: (a: any): a is Name => typeof a === "string",
    options: (a: any): a is SocketOptions =>
      typeof a === "object" && !isSourceLocation(a) && !("$connect" in a),
    handlers: (a: any): a is SocketHandlers<IncomingRoutes, ConnectQuery> =>
      typeof a === "object" && !isSourceLocation(a) && "$connect" in a,
  });
}
