import { isActivityWorker } from "./internal/flags.js";
import { getActivityContext, getServiceClient } from "./internal/global.js";
import type { SendActivityHeartbeatResponse } from "./service-client.js";

/**
 * Sends a heartbeat for the current activity or to the provided activity token.
 *
 * If called from outside of an {@link activity}, the activity token must be provided.
 *
 * If the activity has a heartbeatTimeout set and the workflow has not received a heartbeat within the set duration,
 * the workflow will throw a {@link HeartbeatTimeout} and cancel the activity.
 *
 * @returns {@link HeartbeatResponse} which has response.cancelled if the activity was cancelled for any reason (ex: workflow succeeded, failed, or the activity timed out).
 */
export async function sendActivityHeartbeat(
  activityToken?: string
): Promise<SendActivityHeartbeatResponse> {
  return getEventualCallHook().registerEventualCall(undefined, async () => {
    if (activityToken) {
      return await getServiceClient().sendActivityHeartbeat({
        activityToken,
      });
    } else if (isActivityWorker()) {
      const token = (await getActivityContext()).invocation.token;
      return await getServiceClient().sendActivityHeartbeat({
        activityToken: token,
      });
    } else {
      throw new Error(
        "Activity token must be provided when not within an Activity."
      );
    }
  });
}
