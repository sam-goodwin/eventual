import {
  createActivityCall,
  createOverrideActivityCall,
} from "./calls/activity-call.js";
import { ActivityCancelled, EventualError } from "./error.js";
import {
  callableActivities,
  getActivityContext,
  getWorkflowClient,
} from "./global.js";
import { Result } from "./result.js";
import { isActivityWorker, isOrchestratorWorker } from "./runtime/flags.js";

export interface ActivityOptions {
  /**
   * How long the workflow will wait for the activity to complete or fail.
   *
   * @default - workflow will run forever.
   */
  timeoutSeconds?: number;
  /**
   * For long running activities, it is suggested that they report back that they
   * are still in progress to avoid waiting forever or until a long timeout when
   * something goes wrong.
   *
   * When set to a positive number, the activity must call {@link heartbeat} or
   * {@link WorkflowClient.heartbeatActivity} at least every heartbeatSeconds.
   *
   * If it fails to do so, the workflow will cancel the activity and throw an error.
   */
  heartbeatSeconds?: number;
}

export interface ActivityFunction<
  Arguments extends any[],
  Output extends any = any
> {
  (...args: Arguments): Promise<Awaited<UnwrapAsync<Output>>> &
    ActivityExecutionReference<UnwrapAsync<Output>>;
}

export interface ActivityHandler<
  Arguments extends any[],
  Output extends any = any
> {
  (...args: Arguments):
    | Promise<Awaited<Output>>
    | Output
    | AsyncResult<Output>
    | Promise<AsyncResult<Awaited<Output>>>;
}

export type UnwrapAsync<Output> = Output extends AsyncResult<infer O>
  ? O
  : Output;

export type ActivityOutput<A extends ActivityFunction<any, any>> =
  A extends ActivityFunction<any, infer O> ? UnwrapAsync<O> : never;

const AsyncTokenSymbol = Symbol.for("eventual:AsyncToken");

/**
 * When returned from an activity, the activity will become async,
 * allowing it to run "forever". The
 */
export interface AsyncResult<Output = any> {
  [AsyncTokenSymbol]: typeof AsyncTokenSymbol & Output;
}

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}

/**
 * When returned from an {@link activity}, tells the system to make the current
 * activity async. This allows the activity to defer sending a response from the
 * current function and instead complete the activity with {@link WorkflowClient.completeActivity}.
 *
 * ```ts
 * const sqs = new SQSClient();
 * activity("myActivity", () => {
 *    // tells the system that the completeActivity function will be called later with a string result.
 *    return asyncResult<string>(async (activityToken) => {
 *       // before exiting, send the activityToken to a sqs queue to be completed later
 *       // you could invoke any service here
 *       await sqs.send(new SendMessageCommand({ ..., message: JSONl.stringify({ activityToken })));
 *    });
 * })
 * ```
 *
 * @param tokenContext is a callback which provides the activityToken. The activity token is used
 *                     to completeActivity and heartbeatActivity from outside of the
 *                     activity.
 */
export async function asyncResult<Output = any>(
  tokenContext: (token: string) => Promise<void> | void
): Promise<AsyncResult<Output>> {
  if (!isActivityWorker()) {
    throw new Error("asyncResult can only be called from within an activity.");
  }
  const activityContext = getActivityContext();
  if (!activityContext) {
    throw new Error(
      "Activity context has not been set yet, asyncResult can only be used from within an activity."
    );
  }
  await tokenContext(activityContext.activityToken);
  return {
    [AsyncTokenSymbol]: AsyncTokenSymbol as typeof AsyncTokenSymbol & Output,
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
  if (isOrchestratorWorker()) {
    // if we're in the orchestrator, return a command to invoke the activity in the worker function
    return ((...args: Parameters<ActivityFunction<Arguments, Output>>) => {
      return createActivityCall(
        activityID,
        args,
        opts?.timeoutSeconds,
        opts?.heartbeatSeconds
      ) as any;
    }) as ActivityFunction<Arguments, Output>;
  } else {
    // otherwise we must be in an activity, event or api handler
    // register the handler to be looked up during execution.
    callableActivities()[activityID] = handler;
    // calling the activity from outside the orchestrator just calls the handler
    return ((...args) => handler(...args)) as ActivityFunction<
      Arguments,
      Output
    >;
  }
}

export type ActivityTarget = OwnActivityTarget | ActivityTokenTarget;

export enum ActivityTargetType {
  OwnActivity,
  ActivityToken,
}

export interface OwnActivityTarget {
  type: ActivityTargetType.OwnActivity;
  seq: number;
}

export interface ActivityTokenTarget {
  type: ActivityTargetType.ActivityToken;
  activityToken: string;
}

export interface ActivityExecutionReference<T = any> {
  /**
   * Cancel this activity.
   *
   * The activity will reject with a {@link ActivityCancelled} error.
   *
   * If the activity is calling {@link heartbeat}, closed: true will be
   * return to signal the workflow considers the activity finished.
   */
  cancel: (reason: string) => Promise<void>;
  /**
   * Causes the activity to reject with the provided value within the workflow.
   *
   * If the activity is calling {@link heartbeat}, closed: true will be
   * return to signal the workflow considers the activity finished.
   */

  fail: (
    ...args: [error: Error] | [error: string, message: string]
  ) => Promise<void>;
  /**
   * Causes the activity to resolve the provided value to the workflow.
   *
   * If the activity is calling {@link heartbeat}, closed: true will be
   * return to signal the workflow considers the activity finished.
   */
  complete: (result: T) => Promise<void>;
}

/**
 * Causes the activity to resolve the provided value to the workflow.
 *
 * If the activity is calling {@link heartbeat}, closed: true will be
 * return to signal the workflow considers the activity finished.
 */
export function completeActivity<A extends ActivityFunction<any, any> = any>(
  activityToken: string,
  result: ActivityOutput<A>
): Promise<void> {
  if (isOrchestratorWorker()) {
    return createOverrideActivityCall(
      {
        type: ActivityTargetType.ActivityToken,
        activityToken,
      },
      Result.resolved(result)
    ) as any;
  } else {
    return getWorkflowClient().completeActivity({ activityToken, result });
  }
}

/**
 * Causes the activity to reject with the provided value within the workflow.
 *
 * If the activity is calling {@link heartbeat}, closed: true will be
 * return to signal the workflow considers the activity finished.
 */
export function failActivity(
  activityToken: string,
  error: Error
): Promise<void>;
export function failActivity(
  activityToken: string,
  error: string,
  message: string
): Promise<void>;
export function failActivity(
  activityToken: string,
  ...args: [error: Error] | [error: string, message: string]
): Promise<void> {
  const error =
    args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
  if (isOrchestratorWorker()) {
    return createOverrideActivityCall(
      {
        type: ActivityTargetType.ActivityToken,
        activityToken,
      },
      Result.failed(error)
    ) as any;
  } else {
    return getWorkflowClient().failActivity({
      activityToken,
      error: error.name,
      message: error.message,
    });
  }
}

/**
 * Cancel any activity using it's activityToken.
 *
 * The activity will reject with a {@link ActivityCancelled} error.
 *
 * If the activity is calling {@link heartbeat}, closed: true will be
 * return to signal the workflow considers the activity finished.
 */
export function cancelActivity(
  activityToken: string,
  reason: string
): Promise<void> {
  if (isOrchestratorWorker()) {
    // not a real promise, do not await
    return failActivity(activityToken, new ActivityCancelled(reason)) as any;
  } else {
    return failActivity(activityToken, new ActivityCancelled(reason));
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
