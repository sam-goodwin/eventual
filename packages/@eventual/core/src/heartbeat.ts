import { CallKind, createCall } from "./internal/calls.js";
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
  return getEventualHook().executeEventualCall(
    createCall(CallKind.TaskRequestCall, {
      operation: "sendTaskHeartbeat",
      params: [{ taskToken }],
    })
  );
}
