import { createActivityCall } from "./calls/activity-call.js";
import { callableActivities } from "./global.js";
import { isActivityWorker } from "./runtime/flags.js";

export interface ActivityOpts {
  /**
   * How long the workflow will wait for the activity to complete or fail.
   *
   * Default: undefined - forever.
   */
  timeoutSeconds?: number;
}

export interface ActivityFunction<F extends (...args: any[]) => any> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>;
}

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  handler: F
): ActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  opts: ActivityOpts,
  handler: F
): ActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  ...args: [opts: ActivityOpts, handler: F] | [handler: F]
): ActivityFunction<F> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  if (isActivityWorker()) {
    // if we're in the eventual worker, actually run the process amd register the activity
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    return ((...args) => handler(...args)) as ActivityFunction<F>;
  } else {
    // otherwise, return a command to invoke the activity in the worker function
    return ((...args: Parameters<ActivityFunction<F>>) => {
      return createActivityCall(activityID, args, opts?.timeoutSeconds) as any;
    }) as ActivityFunction<F>;
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
