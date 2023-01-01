import { createActivityCall } from "./calls/activity-call.js";
import {
  callableActivities,
  getActivityContext,
  getServiceClient,
} from "./global.js";
import { isActivityWorker, isOrchestratorWorker } from "./runtime/flags.js";
import {
  EventualServiceClient,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
} from "./service-client.js";

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
   * {@link EventualServiceClient.sendActivityHeartbeat} at least every heartbeatSeconds.
   *
   * If it fails to do so, the workflow will cancel the activity and throw an error.
   */
  heartbeatSeconds?: number;
}

export interface ActivityFunction<Arguments extends any[], Output = any> {
  (...args: Arguments): Promise<Awaited<UnwrapAsync<Output>>>;

  /**
   * Complete an activity request by its {@link SendActivitySuccessRequest.activityToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in an activity
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncActivity = activity("async", () => {
   *   return asyncResult<string>(token => tokenEvent.publishEvents({ token }));
   * });
   *
   * tokenEvent.onEvent(async ({token}) => {
   *   await asyncActivity.sendActivitySuccess({
   *     activityToken: token,
   *     result: "done"
   *   });
   * })
   * ```
   */
  sendActivitySuccess(
    request: Omit<
      SendActivitySuccessRequest<Awaited<UnwrapAsync<Output>>>,
      "type"
    >
  ): Promise<void>;

  /**
   * Fail an activity request by its {@link SendActivityFailureRequest.activityToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in an activity
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncActivity = activity("async", () => {
   *   return asyncResult<string>(token => tokenEvent.publishEvents({ token }));
   * });
   *
   * tokenEvent.onEvent(async ({token}) => {
   *   await asyncActivity.sendActivityFailure({
   *     activityToken: token,
   *     error: "MyError",
   *     message: "Something went wrong"
   *   });
   * })
   * ```
   */
  sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void>;

  /**
   * Heartbeat an activity request by its {@link SendActivityHeartbeatRequest.activityToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in an activity
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncActivity = activity("async", () => {
   *   return asyncResult<string>(token => tokenEvent.publishEvents({ token }));
   * });
   *
   * tokenEvent.onEvent(async ({token}) => {
   *   await asyncActivity.sendActivityFailure({
   *     activityToken: token
   *   });
   * })
   * ```
   */
  sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse>;

  activityID: string;
}

export interface ActivityHandler<Arguments extends any[], Output = any> {
  (...args: Arguments):
    | Promise<Awaited<Output>>
    | Output
    | AsyncResult<Output>
    | Promise<AsyncResult<Awaited<Output>>>;
}

export type UnwrapAsync<Output> = Output extends AsyncResult<infer O>
  ? O
  : Output;

export type ActivityArguments<A extends ActivityFunction<any, any>> =
  A extends ActivityFunction<infer Arguments extends any[]> ? Arguments : never;

export type ActivityOutput<A extends ActivityFunction<any, any>> =
  A extends ActivityFunction<any, infer Output> ? UnwrapAsync<Output> : never;

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
 * current function and instead complete the activity with {@link WorkflowClient.sendActivitySuccess}.
 *
 * ```ts
 * const sqs = new SQSClient();
 * activity("myActivity", () => {
 *    // tells the system that the sendActivitySuccess function will be called later with a string result.
 *    return asyncResult<string>(async (activityToken) => {
 *       // before exiting, send the activityToken to a sqs queue to be completed later
 *       // you could invoke any service here
 *       await sqs.send(new SendMessageCommand({ ..., message: JSONl.stringify({ activityToken })));
 *    });
 * })
 * ```
 *
 * @param tokenContext is a callback which provides the activityToken. The activity token is used
 *                     to sendActivitySuccess and sendActivityHeartbeat from outside of the
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
export function activity<Arguments extends any[], Output = any>(
  activityID: string,
  handler: ActivityHandler<Arguments, Output>
): ActivityFunction<Arguments, Output>;
export function activity<Arguments extends any[], Output = any>(
  activityID: string,
  opts: ActivityOptions,
  handler: ActivityHandler<Arguments, Output>
): ActivityFunction<Arguments, Output>;
export function activity<Arguments extends any[], Output = any>(
  activityID: string,
  ...args:
    | [opts: ActivityOptions, handler: ActivityHandler<Arguments, Output>]
    | [handler: ActivityHandler<Arguments, Output>]
): ActivityFunction<Arguments, Output> {
  const [opts, handler] = args.length === 1 ? [undefined, args[0]] : args;
  // register the handler to be looked up during execution.
  callableActivities()[activityID] = handler;
  const func = ((...args: Parameters<ActivityFunction<Arguments, Output>>) => {
    if (isOrchestratorWorker()) {
      // if we're in the orchestrator, return a command to invoke the activity in the worker function
      return createActivityCall(
        activityID,
        args,
        opts?.timeoutSeconds,
        opts?.heartbeatSeconds
      ) as any;
    } else {
      // calling the activity from outside the orchestrator just calls the handler
      return handler(...args);
    }
  }) as ActivityFunction<Arguments, Output>;
  func.sendActivitySuccess = async function (request) {
    return getServiceClient().sendActivitySuccess(request);
  };
  func.sendActivityFailure = async function (request) {
    return getServiceClient().sendActivityFailure(request);
  };
  func.sendActivityHeartbeat = async function (request) {
    return getServiceClient().sendActivityHeartbeat(request);
  };
  func.activityID = activityID;
  return func;
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
