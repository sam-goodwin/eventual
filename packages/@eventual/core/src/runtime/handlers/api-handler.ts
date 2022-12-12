import { api } from "../../api.js";
import { registerEventClient, registerWorkflowClient } from "../../global.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { EventClient } from "../index.js";

export interface ApiHandlerDependencies {
  workflowClient: WorkflowClient;
  eventClient: EventClient;
}

/**
 * Creates a generic function for handling inbound API requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createApiHandler({
  workflowClient,
  eventClient,
}: ApiHandlerDependencies) {
  // make the workflow client available to web hooks
  registerWorkflowClient(workflowClient);
  registerEventClient(eventClient);

  api.all("*", () => new Response("Not Found.", { status: 404 }));

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return async function processRequest(request: Request): Promise<Response> {
    try {
      return api.handle(request);
    } catch (err) {
      console.error(err);
      return new Response("Internal Server Error", {
        status: 500,
      });
    }
  };
}
