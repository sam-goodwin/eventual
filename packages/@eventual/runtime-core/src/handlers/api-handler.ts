import {
  api,
  ApiRequest,
  ApiResponse,
  EventualServiceClient,
  registerServiceClient,
  ServiceType,
  serviceTypeScope,
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

  api.all("*", () => ({
    status: 404,
    body: "Not Found",
  }));

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return async function processRequest(
    request: ApiRequest
  ): Promise<ApiResponse> {
    return await serviceTypeScope(ServiceType.ApiHandler, async () => {
      try {
        return api.handle(request);
      } catch (err) {
        console.error(err);
        return {
          status: 500,
          body: "Internal Server Error",
        };
      }
    });
  };
}
