import {
  commands,
  EventualServiceClient,
  isHttpError,
  HttpRequest,
  HttpResponse,
  registerServiceClient,
  RestParamSpec,
  ServiceType,
  serviceTypeScope,
} from "@eventual/core";
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
          console.warn(err);
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
    // RPC route takes a POST request and passes the parsed JSON body as input to the input
    router.post(`/_rpc/${command.name}`, async (request) => {
      if (command.passThrough) {
        // if passthrough is enabled, just proxy the request-response to the handler
        return command.handler(request);
      }

      let input = await request.json();
      if (command.input) {
        input = command.input.parse(command.input);
      }
      let output = await command.handler(input, {
        headers: request.headers,
      });
      if (command.output) {
        output = command.output.parse(output);
      }
      return new HttpResponse(JSON.stringify(output, jsonReplacer), {
        status: 200,
      });
    });

    if (command.path && command.method) {
      const method = command.method.toLocaleLowerCase() as keyof Router;

      // REST routes parse the request according to the command's path/method/params configuration
      router[method](command.path, async (request: HttpRequest) => {
        if (command.passThrough) {
          // if passthrough is enabled, just proxy the request-response to the handler
          return command.handler(request);
        }

        // first, get the body as pure JSON - assume it's an object
        const body = await request.json();
        let input: any = {
          ...request.params,
        };

        // parse headers/params/queries/body into the RPC interface
        if (command.params) {
          Object.entries(command.params as Record<string, RestParamSpec>).map(
            ([name, spec]) => {
              input[name] = resolveInput(name, spec);
            }
          );
        }

        if (command.input) {
          // validate the zod input schema if one is specified
          input = command.input.parse(input);
        }

        // call the command RPC handler
        let output = await command.handler(input, {
          headers: request.headers,
        });

        if (command.output) {
          // validate the output of the command handler against the schema if it's defined
          output = command.output.parse(output);
        }

        // TODO: support mapping RPC output back to HTTP properties such as Headers

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
            return request.headers?.[name];
          } else if (spec === "path") {
            return request.params?.[name];
          } else {
            return resolveInput(spec.name ?? name, spec.in);
          }
        }
      });
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
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  } else if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
