import { CallKind, TaskRequestCall, createCall } from "./internal/calls.js";
import {
  PropertyKind,
  TaskTokenProperty,
  createEventualProperty,
} from "./internal/properties.js";
import { isTaskWorker } from "./internal/service-type.js";
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
  const hook = getEventualHook();
  if (!isTaskWorker() && !taskToken) {
    throw new Error(
      "Task Token must be provided to SendTaskHeartbeat when outside of a task."
    );
  }
  return hook.executeEventualCall(
    createCall<TaskRequestCall<"sendTaskHeartbeat">>(CallKind.TaskRequestCall, {
      operation: "sendTaskHeartbeat",
      params: [
        {
          taskToken:
            taskToken ??
            hook.getEventualProperty(
              createEventualProperty<TaskTokenProperty>(
                PropertyKind.TaskToken,
                {}
              )
            ),
        },
      ],
    })
  ) as Promise<SendTaskHeartbeatResponse>;
}
