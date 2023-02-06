import {
  api,
  EventualServiceClient,
  registerServiceClient,
  ServiceType,
  serviceTypeScope,
  HttpResponse,
  HttpRequest,
  RawHttpResponse,
  RawHttpRequest,
  HttpRoute,
  Params,
} from "@eventual/core";

// superjson handles types like Date, Map, Set, etc.
// TODO: is it worth bringing in a dependency or should we roll it ourselves?
import json from "superjson";

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

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return async function processRequest(
    request: RawHttpRequest
  ): Promise<RawHttpResponse> {
    return await serviceTypeScope(ServiceType.ApiHandler, async () => {
      try {
        const route = await api.handle(request);
        const response = await route.handler(
          await parseHttpRequest(route, request)
        );
        if (response === undefined) {
          return new RawHttpResponse("Not Found", {
            status: 404,
          });
        }

        if (response instanceof RawHttpResponse) {
          return response;
        } else {
          return serializeHttpResponse(route, response);
        }
      } catch (err) {
        console.error(err);
        return new RawHttpResponse("Internal Server Error", {
          status: 500,
        });
      }
    });
  };
}

async function parseHttpRequest(
  route: HttpRoute,
  request: RawHttpRequest
): Promise<HttpRequest> {
  if (route.input) {
    const body = await parseBody(route.input, request);
    return {
      body,
      method: request.method,
      url: request.url,
      params: parseParams(route.input, request),
      text: request.text.bind(request),
      json: () => Promise.resolve(body),
    };
  }
  return request;
}

async function parseBody(schema: HttpRequest.Schema, request: RawHttpRequest) {
  const rawJson = await request.json();
  return schema.body ? schema.body.parse(rawJson) : rawJson;
}

function parseParams(schema: HttpRequest.Schema, request: RawHttpRequest) {
  return schema.params
    ? Object.fromEntries(
        Object.entries(request.params).map(([paramName, paramValue]) => {
          const paramSchema = (schema?.params as Params.Schema<string>)[
            paramName
          ];
          if (paramSchema) {
            return [paramName, paramSchema.parse(paramValue)];
          }
          return [paramName, paramValue];
        })
      )
    : request.params;
}

function serializeHttpResponse(
  _route: HttpRoute,
  response: HttpResponse
): RawHttpResponse {
  // TODO: validate schema
  return new RawHttpResponse(json.stringify(response.body), {
    status: response.status,
    headers: response.headers
      ? Object.fromEntries(
          Object.entries(response.headers).flatMap(
            ([headerName, headerValue]) => {
              if (headerValue === undefined) {
                return [];
              }
              return [[headerName, headerValue.toString()]];
            }
          )
        )
      : undefined,
    statusText: response.statusText,
  });
}
