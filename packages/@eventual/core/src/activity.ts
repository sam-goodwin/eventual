import { ExecutionID } from "./execution.js";
import { FunctionRuntimeProps } from "./function-props.js";
import { AsyncTokenSymbol } from "./internal/activity.js";
import { createActivityCall } from "./internal/calls/activity-call.js";
import {
  createAwaitDurationCall,
  createAwaitTimeCall,
} from "./internal/calls/await-time-call.js";
import type {
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivitySuccessRequest,
} from "./internal/eventual-service.js";
import { isActivityWorker, isOrchestratorWorker } from "./internal/flags.js";
import {
  activities,
  getActivityContext,
  getServiceClient,
} from "./internal/global.js";
import { isDurationSchedule, isTimeSchedule } from "./internal/schedule.js";
import { isSourceLocation, SourceLocation } from "./internal/service-spec.js";
import type { DurationSchedule, Schedule } from "./schedule.js";
import {
  EventualServiceClient,
  SendActivityHeartbeatResponse,
} from "./service-client.js";

export interface ActivityRuntimeProps extends FunctionRuntimeProps {}

/**
 * Activity options available when invoked by a workflow.
 */
export interface ActivityInvocationOptions {
  /**
   * A promise whose resolution (fulfillment or rejection) determines the timeout for an activity.
   *
   *
   * Overrides any timeout configured on the activity definition.
   *
   * ```ts
   * // times out after 10 minutes
   * myActivity("someInput", { timeout: duration(10, "minutes") });
   * // times out when myTimeoutActivity resolves
   * myActivity("someInput", { timeout: myTimeoutActivity() });
   * // times out when the value x is equal to 100
   * myActivity("someInput", { timeout: condition(() => x === 100) });
   * // times out after 10 minutes, like the first example
   * myActivity("someInput", { timeout: Schedule.duration(10, "minutes") });
   * ```
   *
   * @default - the configured activity timeout or the workflow will await forever.
   */
  timeout?: Promise<any> | Schedule;
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
  heartbeatTimeout?: DurationSchedule;
}

/**
 * Activity options available at definition time.
 */
export interface ActivityOptions
  extends Omit<ActivityInvocationOptions, "timeout">,
    FunctionRuntimeProps {
  /**
   * How long the workflow will wait for the activity to complete or fail.
   *
   * @default - workflow will wait forever.
   */
  timeout?: DurationSchedule;
}

export interface ActivitySpec<Name extends string = string> {
  /**
   * Unique name of this Activity.
   */
  name: Name;
  /**
   * Optional runtime properties.
   */
  options?: ActivityOptions;
  sourceLocation?: SourceLocation;
}

export type ActivityArguments<Input = any> = [Input] extends [undefined]
  ? [input?: Input, options?: ActivityInvocationOptions]
  : [input: Input, options?: ActivityInvocationOptions];

export interface Activity<
  Name extends string = string,
  Input = any,
  Output = any
> extends Omit<ActivitySpec<Name>, "name"> {
  kind: "Activity";
  (...args: ActivityArguments<Input>): Promise<Awaited<UnwrapAsync<Output>>>;
  /**
   * Globally unique ID of this {@link Activity}.
   */
  name: Name;
  handler: ActivityHandler<Input, Output>;
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
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
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
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
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
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
   *   await asyncActivity.sendActivityFailure({
   *     activityToken: token
   *   });
   * })
   * ```
   */
  sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse>;
}

export interface ActivityHandler<Input = any, Output = any> {
  (input: Input, context: ActivityContext):
    | Promise<Awaited<Output>>
    | Output
    | AsyncResult<Output>
    | Promise<AsyncResult<Awaited<Output>>>;
}

export type UnwrapAsync<Output> = Output extends AsyncResult<infer O>
  ? O
  : Output;

export type ActivityOutput<A extends Activity<any, any>> = A extends Activity<
  string,
  any,
  infer Output
>
  ? UnwrapAsync<Output>
  : never;

/**
 * When returned from an activity, the activity will become async,
 * allowing it to run "forever". The
 */
export interface AsyncResult<Output = any> {
  [AsyncTokenSymbol]: typeof AsyncTokenSymbol & Output;
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
  await tokenContext(activityContext.invocation.token);
  return {
    [AsyncTokenSymbol]: AsyncTokenSymbol as typeof AsyncTokenSymbol & Output,
  };
}

/**
 * Registers a function as an Activity.
 *
 * @param activityID a string that uniquely identifies the Activity within a single workflow context.
 * @param handler the function that handles the activity
 */
export function activity<Name extends string, Input = any, Output = any>(
  activityID: Name,
  handler: ActivityHandler<Input, Output>
): Activity<Name, Input, Output>;
export function activity<Name extends string, Input = any, Output = any>(
  activityID: Name,
  opts: ActivityOptions,
  handler: ActivityHandler<Input, Output>
): Activity<Name, Input, Output>;
export function activity<Name extends string, Input = any, Output = any>(
  ...args:
    | [
        sourceLocation: SourceLocation,
        name: Name,
        opts: ActivityOptions,
        handler: ActivityHandler<Input, Output>
      ]
    | [
        sourceLocation: SourceLocation,
        name: Name,
        handler: ActivityHandler<Input, Output>
      ]
    | [
        name: Name,
        opts: ActivityOptions,
        handler: ActivityHandler<Input, Output>
      ]
    | [name: Name, handler: ActivityHandler<Input, Output>]
): Activity<Name, Input, Output> {
  const [sourceLocation, name, opts, handler] =
    args.length === 2
      ? // just handler
        [undefined, args[0], undefined, args[1]]
      : args.length === 4
      ? // source location, opts, handler
        args
      : isSourceLocation(args[0])
      ? // // source location, handler
        [args[0], args[1] as Name, undefined, args[2]]
      : // opts, handler
        [undefined, args[0] as Name, args[1] as ActivityOptions, args[2]];
  // register the handler to be looked up during execution.
  const func = ((input, options) => {
    if (isOrchestratorWorker()) {
      const timeout = options?.timeout ?? opts?.timeout;

      // if we're in the orchestrator, return a command to invoke the activity in the worker function
      return createActivityCall(
        name,
        input,
        timeout
          ? isDurationSchedule(timeout)
            ? createAwaitDurationCall(timeout.dur, timeout.unit)
            : isTimeSchedule(timeout)
            ? createAwaitTimeCall(timeout.isoDate)
            : timeout
          : undefined,
        options?.heartbeatTimeout ?? opts?.heartbeatTimeout
      ) as any;
    } else {
      const runtimeContext = getActivityContext();
      const context: ActivityContext = {
        activity: {
          name,
        },
        execution: runtimeContext.execution,
        invocation: runtimeContext.invocation,
      };
      // calling the activity from outside the orchestrator just calls the handler
      return handler(input as Input, context);
    }
  }) as Activity<Name, Input, Output>;

  Object.defineProperty(func, "name", { value: name, writable: false });
  func.sendActivitySuccess = async function (request) {
    return getServiceClient().sendActivitySuccess(request);
  };
  func.sendActivityFailure = async function (request) {
    return getServiceClient().sendActivityFailure(request);
  };
  func.sendActivityHeartbeat = async function (request) {
    return getServiceClient().sendActivityHeartbeat(request);
  };
  func.sourceLocation = sourceLocation;

  // @ts-ignore
  func.handler = handler;
  activities()[name] = func;
  return func;
}

export interface ActivityExecutionContext {
  id: ExecutionID;
  workflowName: string;
}

export interface ActivityDefinitionContext {
  name: string;
}

export interface ActivityInvocationContext {
  /**
   * A token used to complete or heartbeat an activity when running async.
   */
  token: string;
  /**
   * ISO 8601 timestamp when the activity was first scheduled.
   */
  scheduledTime: string;
  /**
   * Current retry count, starting at 0.
   */
  retry: number;
}

export interface ActivityContext {
  /**
   * Workflow execution which started the activity.
   */
  execution: ActivityExecutionContext;
  /**
   * Information about the activity being invoked.
   */
  activity: ActivityDefinitionContext;
  /**
   * Information about this specific invocation of the execution.
   */
  invocation: ActivityInvocationContext;
}
