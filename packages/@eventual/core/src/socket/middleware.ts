import {
  SocketConnectionRequest,
  SocketHandlerContext,
  SocketResponse,
} from "./socket.js";

export interface SocketMiddlewareInput<In extends SocketHandlerContext> {
  request: SocketConnectionRequest;
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

export type SocketMiddleware<
  In extends SocketHandlerContext,
  Out extends SocketHandlerContext
> = (
  input: SocketMiddlewareInput<In>
) => Promise<SocketMiddlewareOutput<Out>> | SocketMiddlewareOutput<Out>;

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
 *
 * @param fn
 * @returns
 */
export function socketMiddleware<
  PrevContext extends SocketHandlerContext = SocketHandlerContext,
  OutContext extends SocketHandlerContext = SocketHandlerContext
>(
  fn: (input: SocketMiddlewareInput<any>) => SocketMiddlewareOutput<OutContext>
) {
  return async <In extends PrevContext>(input: SocketMiddlewareInput<In>) =>
    fn({
      ...input,
      next: (context) =>
        input.next({
          ...input.context,
          ...context,
        }),
    });
}
