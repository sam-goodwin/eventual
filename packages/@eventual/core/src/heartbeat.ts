import { isTaskWorker } from "./internal/flags.js";
import { getServiceClient } from "./internal/global.js";
import type { SendTaskHeartbeatResponse } from "./service-client.js";

/**
 * Sends a heartbeat for the current task or to the provided task token.
 *
 * If called from outside of an {@link task}, the task token must be provided.
 *
 * If the task has a heartbeatTimeout set and the workflow has not received a heartbeat within the set duration,
 * the workflow will throw a {@link HeartbeatTimeout} and cancel the task.
 *
 * @returns {@link HeartbeatResponse} which has response.cancelled if the task was cancelled for any reason (ex: workflow succeeded, failed, or the task timed out).
 */
export async function sendTaskHeartbeat(
  taskToken?: string
): Promise<SendTaskHeartbeatResponse> {
  return getEventualCallHook().registerEventualCall(undefined, async () => {
    if (taskToken) {
      return await getServiceClient().sendTaskHeartbeat({
        taskToken,
      });
    } else if (isTaskWorker()) {
      const token = (await getEventualTaskRuntimeContext()).invocation.token;
      return await getServiceClient().sendTaskHeartbeat({
        taskToken: token,
      });
    } else {
      throw new Error("Task token must be provided when not within a task.");
    }
  });
}
