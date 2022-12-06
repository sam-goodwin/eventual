import itty from "itty-router";
import { registerWorkflowClient } from "../../global.js";
import { createRouter, getHooks } from "../../hook.js";
import type { WorkflowClient } from "../clients/workflow-client.js";

export function createWebhookProcessor(workflowClient: WorkflowClient) {
  // make the workflow client available to web hooks
  registerWorkflowClient(workflowClient);

  // initialize all web hooks onto the central HTTP router
  const router = createRouter();

  getHooks().forEach((hook) => hook(router));

  router.all("*", () => new Response("Not Found.", { status: 404 }));

  /**
   * Handle inbound webhook API requests.
   *
   * Each webhook registers routes on the central {@link router} which
   * then handles the request.
   */
  return async function processWebhook(
    request: itty.Request
  ): Promise<Response> {
    try {
      return router.handle(request);
    } catch (err) {
      console.error(err);
      return new Response("Internal Server Error", {
        status: 500,
      });
    }
  };
}
