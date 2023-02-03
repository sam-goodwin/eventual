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
} from "@eventual/core";

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
        const response = await api.handle(parseHttpRequest(request));
        if (response === undefined) {
          return new RawHttpResponse("Not Found", {
            status: 404,
          });
        }

        if (response instanceof RawHttpResponse) {
          return response;
        } else {
          return toRawHttpResponse(response);
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

function parseHttpRequest(
  request: RawHttpRequest
): RawHttpRequest | HttpRequest {
  return request;
}

function toRawHttpResponse(request: HttpResponse): RawHttpResponse {
  return new RawHttpResponse(JSON.stringify(request.body));
}
