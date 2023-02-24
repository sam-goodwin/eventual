import {
  EventualServiceClient,
  isHttpError,
  HttpRequest,
  HttpResponse,
  RestParamSpec,
} from "@eventual/core";
import {
  registerServiceClient,
  serviceTypeScope,
  ServiceType,
  commands,
} from "@eventual/core/internal";
import itty from "itty-router";

export interface ApiHandlerDependencies {
  serviceClient: EventualServiceClient;
}

/**
 * Creates a generic function for handling inbound API requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createApiHandler({ serviceClient }: ApiHandlerDependencies) {
  // make the service client available to web hooks
  registerServiceClient(serviceClient);

  const router = initRouter();

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return function processRequest(request: HttpRequest): Promise<HttpResponse> {
    console.log("request", request);
    return serviceTypeScope(ServiceType.ApiHandler, async () => {
      try {
        const response = await router.handle(request);
        if (response === undefined) {
          return new HttpResponse(
            `Not Found: ${request.method} ${request.url}`,
            {
              status: 404,
              statusText: "Not Found",
            }
          );
        }
        return response;
      } catch (err) {
        if (isHttpError(err)) {
          return new HttpResponse(
            JSON.stringify({
              message: err.message,
              data: err.data,
            }),
            {
              status: err.code,
            }
          );
        } else if (err instanceof Error) {
          console.error(err);
          return new HttpResponse(err.message, {
            status: 500,
            statusText: "Internal Server Error",
          });
        } else {
          return new HttpResponse("Internal Server Error", {
            status: 500,
          });
        }
      }
    });
  };
}

function initRouter() {
  const router: Router = itty.Router<HttpRequest, Router>();

  for (const command of commands) {
    const shouldValidate = command.validate !== false;

    // RPC route takes a POST request and passes the parsed JSON body as input to the input
    router.post(
      `/_rpc/${command.name}`,
      withMiddleware(async (request, context) => {
        if (command.passThrough) {
          // if passthrough is enabled, just proxy the request-response to the handler
          return command.handler(request, context);
        }

        let input: any = await request.tryJson();
        if (command.input && shouldValidate) {
          try {
            input = command.input.parse(input);
          } catch (err) {
            console.error("Invalid input", err, input);
            return new HttpResponse(JSON.stringify(err), {
              status: 400,
              statusText: "Invalid input",
            });
          }
        }

        let output: any = await command.handler(input, context);
        if (command.output && shouldValidate) {
          try {
            output = command.output.parse(output);
          } catch (err) {
            console.error("RPC output did not match schema", output, err);
            return new HttpResponse(JSON.stringify(err), {
              status: 500,
              statusText: "RPC output did not match schema",
            });
          }
        }
        return new HttpResponse(JSON.stringify(output, jsonReplacer), {
          status: 200,
        });
      })
    );

    const path = command.path;

    if (path) {
      const method = (command.method?.toLocaleLowerCase() ??
        "all") as keyof Router;

      // REST routes parse the request according to the command's path/method/params configuration
      router[method](
        path,
        withMiddleware(async (request: HttpRequest, context) => {
          if (command.passThrough) {
            // if passthrough is enabled, just proxy the request-response to the handler
            return command.handler(request, context);
          }

          // first, get the body as pure JSON - assume it's an object
          const body = await request.tryJson();
          let input: any = {
            ...request.params,
            ...(body && typeof body === "object" ? body : {}),
          };

          // parse headers/params/queries/body into the RPC interface
          if (command.params) {
            Object.entries(command.params as Record<string, RestParamSpec>).map(
              ([name, spec]) => {
                input[name] = resolveInput(name, spec);
              }
            );
          }

          if (command.input && shouldValidate) {
            // validate the zod input schema if one is specified
            input = command.input.parse(input);
          }

          // call the command RPC handler
          let output: any = await command.handler(input, context);

          if (command.output && shouldValidate) {
            // validate the output of the command handler against the schema if it's defined
            output = command.output.parse(output);
          }

          // TODO: support mapping RPC output back to HTTP properties such as Headers
          // TODO: support alternative status code https://github.com/functionless/eventual/issues/276

          return new HttpResponse(JSON.stringify(output, jsonReplacer), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          });

          function resolveInput(name: string, spec: RestParamSpec): any {
            if (spec === "body") {
              return body?.[name];
            } else if (spec === "query") {
              return request.query?.[name];
            } else if (spec === "header") {
              return request.headers.get(name);
            } else if (spec === "path") {
              return request.params?.[name];
            } else {
              return resolveInput(spec.name ?? name, spec.in);
            }
          }
        })
      );
    }

    /**
     * Applies the chain of middleware callbacks to the request to build up
     * context and pass it through the chain and finally to the handler.
     *
     * Each context can add to or completely replace the context. They can
     * also break the chain at any time by returning a HttpResponse instead
     * of calling `next`.
     *
     * @param handler
     * @returns
     */
    function withMiddleware(
      handler: (request: HttpRequest, context: any) => Promise<HttpResponse>
    ) {
      return async (request: HttpRequest): Promise<HttpResponse> => {
        const chain = (command.middlewares ?? []).values();

        return next(request, {});

        async function next(
          request: HttpRequest,
          context: any
        ): Promise<HttpResponse> {
          let consumed = false;
          const middleware = chain.next();
          if (middleware.done) {
            return handler(request, context);
          } else {
            return middleware.value({
              request,
              context,
              next: async (context) => {
                if (consumed) {
                  consumed = true;
                  throw new Error(
                    `Middleware cannot call 'next' more than once`
                  );
                }
                return next(request, context);
              },
            });
          }
        }
      };
    }
  }

  return router;
}

interface Router {
  handle: (request: HttpRequest, ...extra: any) => Promise<HttpResponse>;
  get: RouteFactory;
  head: RouteFactory;
  post: RouteFactory;
  put: RouteFactory;
  delete: RouteFactory;
  connect: RouteFactory;
  options: RouteFactory;
  trace: RouteFactory;
  patch: RouteFactory;
}

interface RouteFactory {
  (path: string, handlers: RouteHandler): Router;
}

type RouteHandler = (
  request: HttpRequest,
  ...args: any
) => HttpResponse | Promise<HttpResponse>;

/**
 * Implements JSON serialization for well known types.
 */
function jsonReplacer(_key: string, value: any) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
