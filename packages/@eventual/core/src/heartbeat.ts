import { getActivityContext, getWorkflowClient } from "./global.js";
import { HeartbeatResponse } from "./runtime/clients/workflow-client.js";
import { isActivityWorker, isOrchestratorWorker } from "./runtime/flags.js";

/**
 * Sends a heartbeat for the current activity or to the provided activity token.
 * 
 * If called from outside of an {@link activity}, the activity token must be provided.
 *
 * If the activity has a heartbeatTimeout set and the workflow has not received a heartbeat in heartbeatTimeoutSeconds,
 * the workflow will throw a {@link HeartbeatTimeout} and cancel the activity.
 *
 * @returns {@link HeartbeatResponse} which has response.cancelled if the activity was cancelled for any reason (ex: workflow completed, failed, or the activity timed out).
 */
export async function heartbeat(
  activityToken?: string
): Promise<HeartbeatResponse> {
  if (isOrchestratorWorker()) {
    throw new Error(
      "Heartbeat is not currently supported from within a workflow. Use an activity with `heartbeat()`."
    );
  } else if (activityToken) {
    return await getWorkflowClient().heartbeatActivity({
      activityToken,
    });
  } else if (isActivityWorker()) {
    const token = getActivityContext().activityToken;
    return await getWorkflowClient().heartbeatActivity({
      activityToken: token,
    });
  } else {
    throw new Error(
      "Activity token must be provided when not within an Activity."
    );
  }
}
