import { createActivityCall } from "./calls/activity-call.js";
import { callableActivities, getActivityContext } from "./global.js";
import { isActivityWorker, isOrchestratorWorker } from "./runtime/flags.js";

export interface ActivityOptions {
  /**
   * How long the workflow will wait for the activity to complete or fail.
   *
   * @default - workflow will run forever.
   */
  timeoutSeconds?: number;
}

export interface ActivityFunction<
  Arguments extends any[],
  Output extends any = any
> {
  (...args: Arguments): Promise<Awaited<UnwrapAsync<Output>>>;
}

export type ActivityHandler<
  Arguments extends any[],
  Output extends any = any
> = (
  ...args: Arguments
) =>
  | Promise<Awaited<Output>>
  | Output
  | MakeAsync<Output>
  | Promise<MakeAsync<Awaited<Output>>>;

export type UnwrapAsync<Output> = Output extends MakeAsync<infer O>
  ? O
  : Output;

export const AsyncTokenSymbol = Symbol.for("eventual:AsyncToken");

/**
 * When returned from an activity, the activity will become async,
 * allowing it to run "forever". The
 */
export interface MakeAsync<Output = any> {
  [AsyncTokenSymbol]: typeof AsyncTokenSymbol;
  __outputType: Output;
}

export function isMakeAsync(obj: any): obj is MakeAsync {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}

export async function makeAsync<Output = any>(
  tokenContext: (token: string) => Promise<void> | void
): Promise<MakeAsync<Output>> {
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
    __outputType: undefined as Output,
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
export function activity<Arguments extends any[], Output extends any = any>(
  activityID: string,
  handler: ActivityHandler<Arguments, Output>
): ActivityFunction<Arguments, Output>;
export function activity<Arguments extends any[], Output extends any = any>(
  activityID: string,
  opts: ActivityOptions,
  handler: ActivityHandler<Arguments, Output>
): ActivityFunction<Arguments, Output>;
export function activity<Arguments extends any[], Output extends any = any>(
  activityID: string,
  ...args:
    | [opts: ActivityOptions, handler: ActivityHandler<Arguments, Output>]
    | [handler: ActivityHandler<Arguments, Output>]
): ActivityFunction<Arguments, Output> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  if (isActivityWorker()) {
    // if we're in the eventual worker, actually run the process amd register the activity
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    return ((...args) => handler(...args)) as ActivityFunction<
      Arguments,
      Output
    >;
  } else if (isOrchestratorWorker()) {
    // otherwise, return a command to invoke the activity in the worker function
    return ((...args: Parameters<ActivityFunction<Arguments, Output>>) => {
      return createActivityCall(activityID, args, opts?.timeoutSeconds) as any;
    }) as ActivityFunction<Arguments, Output>;
  }
  return undefined as any;
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
