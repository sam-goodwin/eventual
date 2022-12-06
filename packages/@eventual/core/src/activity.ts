import { createActivityCall } from "./calls/activity-call.js";
import { callableActivities, getActivityContext } from "./global.js";
import { isActivityWorker, isOrchestratorWorker } from "./runtime/flags.js";

export interface ActivityOpts {
  /**
   * How long the workflow will wait for the activity to complete or fail.
   *
   * @default - workflow will run forever.
   */
  timeoutSeconds?: number;
}

export interface ActivityFunction<F extends (...args: any[]) => any> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>;
}

export interface ActivityHandler<F extends (...args: any[]) => any> {
  (...args: Parameters<F>):
    | Promise<Awaited<ReturnType<F>>>
    | ReturnType<F>
    | MakeAsync
    | Promise<MakeAsync>;
}

export const AsyncTokenSymbol = Symbol.for("eventual:AsyncToken");

/**
 * When returned from an activity, the activity will become async,
 * allowing it to run "forever". The
 */
export interface MakeAsync {
  [AsyncTokenSymbol]: typeof AsyncTokenSymbol;
}

export function isMakeAsync(obj: any): obj is MakeAsync {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}

export async function makeAsync(
  tokenContext: (token: string) => Promise<void> | void
): Promise<MakeAsync> {
  if (!isActivityWorker()) {
    throw new Error("makeAsync can only be called from within an activity.");
  }
  const activityContext = getActivityContext();
  if (!activityContext) {
    throw new Error(
      "Activity context has not been set yet, makeAsync can only be used from within an activity."
    );
  }
  await tokenContext(activityContext.activityToken);
  return {
    [AsyncTokenSymbol]: AsyncTokenSymbol,
  };
}

export interface ActivityContext {
  workflowName: string;
  executionId: string;
  activityToken: string;
  scheduledTime: string;
}

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  handler: ActivityHandler<F>
): ActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  opts: ActivityOpts,
  handler: ActivityHandler<F>
): ActivityFunction<F>;
export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  ...args:
    | [opts: ActivityOpts, handler: ActivityHandler<F>]
    | [handler: ActivityHandler<F>]
): ActivityFunction<F> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  if (isActivityWorker()) {
    // if we're in the eventual worker, actually run the process amd register the activity
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    return ((...args) => handler(...args)) as ActivityFunction<F>;
  } else if (isOrchestratorWorker()) {
    // otherwise, return a command to invoke the activity in the worker function
    return ((...args: Parameters<ActivityFunction<F>>) => {
      return createActivityCall(activityID, args, opts?.timeoutSeconds) as any;
    }) as ActivityFunction<F>;
  } else {
    throw new Error("Activity can only be called from within a workflow.");
  }
}

/**
 * Retrieve an activity function that has been registered in a workflow.
 */
export function getCallableActivity(
  activityId: string
): ActivityHandler<any> | undefined {
  return callableActivities()[activityId] as ActivityHandler<any>;
}

export function getCallableActivityNames() {
  return Object.keys(callableActivities());
}
