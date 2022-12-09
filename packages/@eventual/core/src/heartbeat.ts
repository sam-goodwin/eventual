import { getActivityContext, getWorkflowClient } from "./global.js";
import { HeartbeatResponse } from "./runtime/clients/workflow-client.js";
import { isActivityWorker } from "./runtime/flags.js";

/**
 * Sends a heartbeat for the current activity to it's calling workflow execution.
 *
 * If the activity has a heartbeatTimeout set and the workflow has not received a heartbeat in heartbeatTimeoutSeconds,
 * the workflow will throw a {@link HeartbeatTimeout} and cancel the activity.
 *
 * @returns {@link HeartbeatResponse} which has response.cancelled if the activity was cancelled for any reason (ex: workflow completed, failed, or the activity timed out).
 */
export async function heartbeat(): Promise<HeartbeatResponse> {
  if (isActivityWorker()) {
    const token = getActivityContext().activityToken;
    return await getWorkflowClient().heartbeatActivity({
      activityToken: token,
    });
  } else {
    throw new Error(
      "heartbeat can only be called within an activity. Use workflowClient.heartbeatActivity outside of the activity."
    );
  }
}
