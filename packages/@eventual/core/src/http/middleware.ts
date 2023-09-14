import { CommandContext } from "./command.js";
import { HttpRequest, HttpResponse } from "./request-response.js";

export interface MiddlewareInput<In> {
  request: HttpRequest;
  context: In;
  // Middleware should maintain the base context form in the next context.
  // The base context values can be modified/used.
  next: <O extends CommandContext>(context: O) => Promise<MiddlewareOutput<O>>;
}

export interface MiddlewareOutput<Context> extends HttpResponse {
  // TODO: leaving this as undefined breaks type safety
  context?: Context;
}

export type Middleware<In, Out> = (
  input: MiddlewareInput<In>
) => Promise<MiddlewareOutput<Out>> | MiddlewareOutput<Out>;

/**
 * Utility for creating a Middleware function that combines its output context
 * with the input context.
 *
 * ```ts
 * const auth = middleware(({request, next}) => {
 *   return next({
 *     isAuthenticated: request.headers.Authorization !== undefined
 *   })
 * });
 *
 * api.use(auth).command("myAuthorizedCommand", async (request, { isAuthenticated }) => {
 *   if (isAuthenticated) {
 *     // do work
 *   }
 * })
 * ```
 *
 * @param fn
 * @returns
 */
export function middleware<
  PrevContext extends CommandContext = CommandContext,
  OutContext extends CommandContext = CommandContext
>(fn: Middleware<PrevContext, OutContext>) {
  return async <In extends PrevContext>(input: MiddlewareInput<In>) =>
    fn({
      ...input,
      next: (context) =>
        input.next({
          ...input.context,
          ...context,
        }),
    });
}
