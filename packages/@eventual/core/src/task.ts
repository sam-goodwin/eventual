import { duration, time } from "./await-time.js";
import type { ExecutionID } from "./execution.js";
import type { FunctionRuntimeProps } from "./function-props.js";
import { EventualCallKind, createEventualCall } from "./internal/calls.js";
import type {
  SendTaskFailureRequest,
  SendTaskHeartbeatRequest,
  SendTaskSuccessRequest,
} from "./internal/eventual-service.js";
import { isTaskWorker } from "./internal/flags.js";
import { getServiceClient, tasks } from "./internal/global.js";
import { isDurationSchedule, isTimeSchedule } from "./internal/schedule.js";
import { SourceLocation, isSourceLocation } from "./internal/service-spec.js";
import { AsyncTokenSymbol, TaskSpec } from "./internal/task.js";
import type { DurationSchedule, Schedule } from "./schedule.js";
import type {
  EventualServiceClient,
  SendTaskHeartbeatResponse,
} from "./service-client.js";
import { ServiceContext } from "./service.js";

export type TaskRuntimeProps = FunctionRuntimeProps;

/**
 * Task options available when invoked by a workflow.
 */
export interface TaskInvocationOptions {
  /**
   * A promise whose resolution (fulfillment or rejection) determines the timeout for a task.
   *
   *
   * Overrides any timeout configured on the task definition.
   *
   * ```ts
   * // times out after 10 minutes
   * myTask("someInput", { timeout: duration(10, "minutes") });
   * // times out when myTimeoutTask resolves
   * myTask("someInput", { timeout: myTimeoutTask() });
   * // times out when the value x is equal to 100
   * myTask("someInput", { timeout: condition(() => x === 100) });
   * // times out after 10 minutes, like the first example
   * myTask("someInput", { timeout: Schedule.duration(10, "minutes") });
   * ```
   *
   * @default - the configured task timeout or the workflow will await forever.
   */
  timeout?: Promise<any> | Schedule;
  /**
   * For long running tasks, it is suggested that they report back that they
   * are still in progress to avoid waiting forever or until a long timeout when
   * something goes wrong.
   *
   * When set to a positive number, the task must call {@link heartbeat} or
   * {@link EventualServiceClient.sendTaskHeartbeat} at least every heartbeatSeconds.
   *
   * If it fails to do so, the workflow will cancel the task and throw an error.
   */
  heartbeatTimeout?: DurationSchedule;
}

/**
 * Task options available at definition time.
 */
export interface TaskOptions
  extends Omit<TaskInvocationOptions, "timeout">,
    FunctionRuntimeProps {
  /**
   * How long the workflow will wait for the task to complete or fail.
   *
   * @default - workflow will wait forever.
   */
  timeout?: DurationSchedule;
}

export type TaskArguments<Input = any> = [Input] extends [undefined]
  ? [input?: Input, options?: TaskInvocationOptions]
  : [input: Input, options?: TaskInvocationOptions];

export interface Task<Name extends string = string, Input = any, Output = any>
  extends Omit<TaskSpec<Name>, "name"> {
  kind: "Task";
  (...args: TaskArguments<Input>): Promise<Awaited<UnwrapAsync<Output>>>;
  /**
   * Globally unique ID of this {@link Task}.
   */
  name: Name;
  handler: TaskHandler<Input, Output>;
  /**
   * Complete a task request by its {@link SendTaskSuccessRequest.taskToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in a task
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncTask = task("async", () => {
   *   return asyncResult<string>(token => tokenEvent.emit({ token }));
   * });
   *
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
   *   await asyncTask.sendTaskSuccess({
   *     taskToken: token,
   *     result: "done"
   *   });
   * })
   * ```
   */
  sendTaskSuccess(
    request: Omit<SendTaskSuccessRequest<Awaited<UnwrapAsync<Output>>>, "type">
  ): Promise<void>;

  /**
   * Fail a task request by its {@link SendTaskFailureRequest.taskToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in a task
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncTask = task("async", () => {
   *   return asyncResult<string>(token => tokenEvent.emit({ token }));
   * });
   *
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
   *   await asyncTask.sendTaskFailure({
   *     taskToken: token,
   *     error: "MyError",
   *     message: "Something went wrong"
   *   });
   * })
   * ```
   */
  sendTaskFailure(request: Omit<SendTaskFailureRequest, "type">): Promise<void>;

  /**
   * Heartbeat a task request by its {@link SendTaskHeartbeatRequest.taskToken}.
   *
   * This method is used in conjunction with {@link asyncResult} in a task
   * to perform asynchronous, long-running computations. For example:
   *
   * ```ts
   * const tokenEvent = event("token");
   *
   * const asyncTask = task("async", () => {
   *   return asyncResult<string>(token => tokenEvent.emit({ token }));
   * });
   *
   * tokenEvent.onEvent("onTokenEvent", async ({token}) => {
   *   await asyncTask.sendTaskFailure({
   *     taskToken: token
   *   });
   * })
   * ```
   */
  sendTaskHeartbeat(
    request: Omit<SendTaskHeartbeatRequest, "type">
  ): Promise<SendTaskHeartbeatResponse>;
}

export interface TaskHandler<Input = any, Output = any> {
  (input: Input, context: TaskContext):
    | Promise<Awaited<Output>>
    | Output
    | AsyncResult<Output>
    | Promise<AsyncResult<Awaited<Output>>>;
}

export type UnwrapAsync<Output> = Output extends AsyncResult<infer O>
  ? O
  : Output;

export type TaskOutput<A extends Task<any, any>> = A extends Task<
  string,
  any,
  infer Output
>
  ? UnwrapAsync<Output>
  : never;

/**
 * When returned from a task, the task will become async,
 * allowing it to run "forever". The
 */
export interface AsyncResult<Output = any> {
  [AsyncTokenSymbol]: typeof AsyncTokenSymbol & Output;
}

/**
 * When returned from an {@link task}, tells the system to make the current
 * task async. This allows the task to defer sending a response from the
 * current function and instead complete the task with {@link WorkflowClient.sendTaskSuccess}.
 *
 * ```ts
 * const sqs = new SQSClient();
 * task("myTask", () => {
 *    // tells the system that the sendTaskSuccess function will be called later with a string result.
 *    return asyncResult<string>(async (taskToken) => {
 *       // before exiting, send the taskToken to a sqs queue to be completed later
 *       // you could invoke any service here
 *       await sqs.send(new SendMessageCommand({ ..., message: JSONl.stringify({ taskToken })));
 *    });
 * })
 * ```
 *
 * @param tokenContext is a callback which provides the taskToken. The task token is used
 *                     to sendTaskSuccess and sendTaskHeartbeat from outside of the
 *                     task.
 */
export async function asyncResult<Output = any>(
  tokenContext: (token: string) => Promise<void> | void
): Promise<AsyncResult<Output>> {
  if (!isTaskWorker()) {
    throw new Error("asyncResult can only be called from within a task.");
  }
  const taskContext = getEventualTaskRuntimeContext();
  if (!taskContext) {
    throw new Error(
      "Task context has not been set yet, asyncResult can only be used from within a task."
    );
  }
  await tokenContext(taskContext.invocation.token);
  return {
    [AsyncTokenSymbol]: AsyncTokenSymbol as typeof AsyncTokenSymbol & Output,
  };
}

/**
 * Registers a function as a task.
 *
 * @param taskID a string that uniquely identifies the Task within a single workflow context.
 * @param handler the function that handles the task
 */
export function task<Name extends string, Input = any, Output = any>(
  taskID: Name,
  handler: TaskHandler<Input, Output>
): Task<Name, Input, Output>;
export function task<Name extends string, Input = any, Output = any>(
  taskID: Name,
  opts: TaskOptions,
  handler: TaskHandler<Input, Output>
): Task<Name, Input, Output>;
export function task<Name extends string, Input = any, Output = any>(
  ...args:
    | [
        sourceLocation: SourceLocation,
        name: Name,
        opts: TaskOptions,
        handler: TaskHandler<Input, Output>
      ]
    | [
        sourceLocation: SourceLocation,
        name: Name,
        handler: TaskHandler<Input, Output>
      ]
    | [name: Name, opts: TaskOptions, handler: TaskHandler<Input, Output>]
    | [name: Name, handler: TaskHandler<Input, Output>]
): Task<Name, Input, Output> {
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
        [undefined, args[0] as Name, args[1] as TaskOptions, args[2]];
  // register the handler to be looked up during execution.
  const func = (async (input, options) => {
    const timeout = options?.timeout ?? opts?.timeout;
    const hook = getEventualCallHook();

    return hook.registerEventualCall(
      createEventualCall(EventualCallKind.TaskCall, {
        name,
        input,
        timeout: timeout
          ? isDurationSchedule(timeout)
            ? duration(timeout.dur, timeout.unit)
            : isTimeSchedule(timeout)
            ? time(timeout.isoDate)
            : timeout
          : undefined,
        heartbeat: options?.heartbeatTimeout ?? opts?.heartbeatTimeout,
      }),
      async () => {
        const runtimeContext = getEventualTaskRuntimeContext();
        const context: TaskContext = {
          task: {
            name,
          },
          execution: runtimeContext.execution,
          invocation: runtimeContext.invocation,
          service: runtimeContext.service,
        };
        // calling the task from outside the orchestrator just calls the handler
        return handler(input as Input, context);
      }
    );
  }) as Task<Name, Input, Output>;

  if (tasks()[name]) {
    throw new Error(`task with name '${name}' already exists`);
  }

  Object.defineProperty(func, "name", { value: name, writable: false });
  func.sendTaskSuccess = async function (request) {
    return getServiceClient().sendTaskSuccess(request);
  };
  func.sendTaskFailure = async function (request) {
    return getServiceClient().sendTaskFailure(request);
  };
  func.sendTaskHeartbeat = async function (request) {
    return getServiceClient().sendTaskHeartbeat(request);
  };
  func.sourceLocation = sourceLocation;

  // @ts-ignore
  func.handler = handler;
  tasks()[name] = func;
  return func;
}

export interface TaskExecutionContext {
  id: ExecutionID;
  workflowName: string;
}

export interface TaskDefinitionContext {
  name: string;
}

export interface TaskInvocationContext {
  /**
   * A token used to complete or heartbeat a task when running async.
   */
  token: string;
  /**
   * ISO 8601 timestamp when the task was first scheduled.
   */
  scheduledTime: string;
  /**
   * Current retry count, starting at 0.
   */
  retry: number;
}

export interface TaskContext {
  /**
   * Workflow execution which started the task.
   */
  execution: TaskExecutionContext;
  /**
   * Information about the task being invoked.
   */
  task: TaskDefinitionContext;
  /**
   * Information about this specific invocation of the execution.
   */
  invocation: TaskInvocationContext;
  /**
   *Information about the containing service.
   */
  service: ServiceContext;
}
