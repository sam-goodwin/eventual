import { SocketOptions, isSourceLocation } from "./internal/service-spec.js";
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
  Name extends string,
  IncomingRoutes extends Record<string, { Input: any; Output: any }>,
  OutgoingRoutes extends Record<string, any>,
  ConnectQuery extends Record<string, any>
> = {
  name: Name;
  handlers: SocketHandlers<IncomingRoutes, ConnectQuery>;
  options?: SocketOptions;
} & {
  [route in keyof OutgoingRoutes]: (
    connectionId: string,
    input: OutgoingRoutes[route]
  ) => Promise<void>;
};

export function socket<
  Name extends string,
  IncomingRoutes extends Record<string, { Input: any; Output: any }>,
  OutgoingRoutes extends Record<string, any>,
  ConnectQuery extends Record<string, any>
>(
  ...args:
    | [
        name: Name,
        options: SocketOptions,
        handlers: SocketHandlers<IncomingRoutes, ConnectQuery>
      ]
    | [name: Name, handlers: SocketHandlers<IncomingRoutes, ConnectQuery>]
): Socket<Name, IncomingRoutes, OutgoingRoutes, ConnectQuery> {
  const { sourceLocation, name, options, handlers } = parseSocketArgs<
    Name,
    IncomingRoutes,
    ConnectQuery
  >(args);
  return {
    name,
    handlers,
  };
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
