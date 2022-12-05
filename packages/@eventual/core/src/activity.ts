import { createActivityCall } from "./calls/activity-call.js";
import { callableActivities } from "./global.js";
import { isActivityWorker } from "./runtime/flags.js";

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  handler: F
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  if (isActivityWorker()) {
    // if we're in the eventual worker, actually run the process amd register the activity
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    return (...args) => handler(...args);
  } else {
    // otherwise, return a command to invoke the activity in the worker function
    return (...args) => {
      return createActivityCall(activityID, args) as any;
    };
  }
}

/**
 * Retrieve an activity function that has been registered in a workflow.
 */
export function getCallableActivity(activityId: string): Function | undefined {
  return callableActivities()[activityId];
}

export function getCallableActivityNames() {
  return Object.keys(callableActivities());
}
