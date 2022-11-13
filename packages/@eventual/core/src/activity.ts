import { createActivityCall } from "./activity-call";

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
  return (...args) => {
    if (process.env.EVENTUAL_WORKER) {
      // if we're in the eventual worker, actually run the process
      return handler(...args);
    } else {
      // otherwise, return a command to invoke the activity in the worker function
      return createActivityCall(activityID, args) as any;
    }
  };
}
