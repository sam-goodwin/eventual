import {
  HttpRequest,
  HttpResponse,
  commandRpcPath,
  isHttpError,
  type CommandContext,
  type RestParam,
} from "@eventual/core";
import { ServiceType, getEventualResources } from "@eventual/core/internal";
import itty from "itty-router";
import { WorkerIntrinsicDeps, createEventualWorker } from "./worker.js";
import { withMiddlewares } from "../utils.js";

export type ApiHandlerDependencies = WorkerIntrinsicDeps;

export interface CommandWorker {
  (request: HttpRequest, commandContext: CommandContext): Promise<HttpResponse>;
}

/**
 * Creates a generic function for handling inbound API requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createCommandWorker(
  deps: ApiHandlerDependencies
): CommandWorker {
  const router = initRouter();

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return createEventualWorker(
    { serviceType: ServiceType.CommandWorker, ...deps },
    async (request, context) => {
      try {
        const response = await router.handle(request, context);
        if (response === undefined) {
          if (request.method === "OPTIONS") {
            return new HttpResponse(undefined, {
              // CORS expects a 204 or 200, using 204 to match API Gateway
              // and accurately reflect NO CONTENT
              status: 204,
            });
          }
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
    }
  );
}

function initRouter() {
  const router: Router = itty.Router<HttpRequest, Router>({
    // paths always start with slash, the router will remove double slashes
    base: "/",
  });

  for (const command of getEventualResources("Command").values()) {
    const shouldValidate = command.validate !== false;

    if (!command.passThrough) {
      // RPC route takes a POST request and passes the parsed JSON body as input to the input
      router.post(
        commandRpcPath(command),
        withMiddlewares<CommandContext, HttpResponse, HttpRequest>(
          command.middlewares ?? [],
          async (request, context) => {
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
            if (command.output?.schema && shouldValidate) {
              try {
                output = command.output.schema.parse(output);
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
          }
        )
      );
    }

    const path = command.path;

    if (path) {
      const method = (command.method?.toLocaleLowerCase() ??
        "all") as keyof Router;

      // REST routes parse the request according to the command's path/method/params configuration
      router[method](
        path,
        withMiddlewares<CommandContext, HttpResponse, HttpRequest>(
          command.middlewares ?? [],
          async (request: HttpRequest, context) => {
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
              Object.entries(command.params).forEach(([name, spec]) => {
                input[name] = resolveInput(name, spec);
              });
            }

            if (command.input && shouldValidate) {
              // validate the zod input schema if one is specified
              input = command.input.parse(input);
            }

            // call the command RPC handler
            let output: any = await command.handler(input, context);

            if (command.output?.schema && shouldValidate) {
              // validate the output of the command handler against the schema if it's defined
              output = command.output.schema.parse(output);
            }

            // TODO: support mapping RPC output back to HTTP properties such as Headers
            // TODO: support alternative status code https://github.com/functionless/eventual/issues/276

            return new HttpResponse(JSON.stringify(output, jsonReplacer), {
              status: command.output?.restStatusCode ?? 200,
              headers: {
                "Content-Type": "application/json",
              },
            });

            function resolveInput(name: string, spec: RestParam): any {
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
          }
        )
      );
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
