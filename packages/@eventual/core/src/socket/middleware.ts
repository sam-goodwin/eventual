import type {
  SocketConnectRequest,
  SocketContext,
  SocketDisconnectRequest,
  SocketHandlerContext,
  SocketMessageRequest,
  SocketRequest,
  SocketResponse,
} from "./socket.js";

export interface SocketMiddlewareInput<
  Request extends SocketRequest,
  In extends SocketHandlerContext
> {
  request: Request;
  context: In;
  // Middleware should maintain the base context form in the next context.
  // The base context values can be modified/used.
  next: <O extends SocketHandlerContext>(
    context: O
  ) => Promise<SocketMiddlewareOutput<O>>;
}

export type SocketMiddlewareOutput<Context extends SocketHandlerContext> =
  SocketResponse & {
    // TODO: leaving this as undefined breaks type safety
    context?: Context;
  };

export type SocketMiddlewareFunction<
  Request extends SocketRequest,
  In extends SocketHandlerContext,
  Out extends SocketHandlerContext
> = (
  input: SocketMiddlewareInput<Request, In>
) => Promise<SocketMiddlewareOutput<Out>> | SocketMiddlewareOutput<Out>;

export interface SocketMiddleware<
  In extends SocketContext = any,
  Out extends SocketContext = any
> {
  connect?: SocketMiddlewareFunction<
    SocketConnectRequest,
    In["connect"],
    Out["connect"]
  >;
  disconnect?: SocketMiddlewareFunction<
    SocketDisconnectRequest,
    In["disconnect"],
    Out["disconnect"]
  >;
  message?: SocketMiddlewareFunction<
    SocketMessageRequest,
    In["message"],
    Out["message"]
  >;
}

/**
 * Utility for creating a Socket Middleware function that combines its output context
 * with the input context.
 *
 * ```ts
 * const auth = socketMiddleware(({request, context, next}) => {
 *   return next({
 *     ...context,
 *     isAuthenticated: request.headers.Authorization !== undefined
 *   })
 * });
 *
 * socket.use(auth)("myAuthorizedCommand", async (request, { isAuthenticated }) => {
 *   if (isAuthenticated) {
 *     // do work
 *   }
 * })
 * ```
 */
export function socketMiddleware<
  PrevContext extends SocketContext = SocketContext,
  OutContext extends SocketContext = SocketContext
>(
  fn:
    | SocketMiddlewareFunction<
        SocketConnectRequest,
        PrevContext["connect"],
        OutContext["connect"]
      >
    | SocketMiddleware<PrevContext, OutContext>
) {
  const { connect, disconnect, message } =
    typeof fn === "function"
      ? { connect: fn, disconnect: undefined, message: undefined }
      : fn;
  return {
    connect: connect ? createNext(connect) : undefined,
    disconnect: disconnect ? createNext(disconnect) : undefined,
    message: message ? createNext(message) : undefined,
  };

  function createNext<
    Request extends SocketRequest,
    InContext extends SocketHandlerContext,
    OutContext extends SocketHandlerContext
  >(fn: SocketMiddlewareFunction<Request, InContext, OutContext>) {
    return async <In extends InContext>(
      input: SocketMiddlewareInput<Request, In>
    ) =>
      fn({
        ...input,
        next: (context) =>
          input.next({
            ...input.context,
            ...context,
          }),
      });
  }
}
