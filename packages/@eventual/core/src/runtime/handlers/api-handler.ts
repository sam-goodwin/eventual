import itty from "itty-router";
import { api } from "../../api.js";
import { registerWorkflowClient } from "../../global.js";
import type { WorkflowClient } from "../clients/workflow-client.js";

/**
 * Creates a generic function for handling inbound API requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createApiHandler(workflowClient: WorkflowClient) {
  // make the workflow client available to web hooks
  registerWorkflowClient(workflowClient);

  api.all("*", () => new Response("Not Found.", { status: 404 }));

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return async function processRequest(
    request: itty.Request
  ): Promise<Response> {
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
