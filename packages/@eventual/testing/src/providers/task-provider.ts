import {
  EventualError,
  HeartbeatTimeout,
  Task,
  TaskContext,
  TaskHandler,
  TaskOutput,
  Timeout,
  asyncResult,
} from "@eventual/core";
import {
  GlobalTaskProvider,
  isFailed,
  isResolved,
  isResult,
} from "@eventual/core-runtime";
import {
  Failed,
  Resolved,
  Result,
  TaskInput,
  assertNever,
  tasks,
} from "@eventual/core/internal";

export class MockableTaskProvider extends GlobalTaskProvider {
  private mockedTasks: Record<string, MockTask<any>> = {};

  public mockTask<A extends Task<any, any>>(
    task: A | string,
    resolution?: TaskOutput<A> | ((input: TaskInput<A>) => TaskOutput<A>)
  ) {
    const id = typeof task === "string" ? task : task.name;
    const realTask = typeof task === "string" ? super.getTask(id) : task;
    if (!realTask) {
      throw new Error("Task being mocked does not exist. " + id);
    }

    const mock =
      (this.mockedTasks[id] as MockTask<A>) ??
      new MockTask<A>(((input: TaskInput<A>, context: TaskContext) =>
        realTask.handler(input, context)) as A);

    if (resolution) {
      if (typeof resolution === "function") {
        mock.invoke(resolution);
      } else {
        mock.succeed(resolution);
      }
    }

    this.mockedTasks[id] = mock;

    return mock;
  }

  public clearMock(task: Task<any, any> | string) {
    const id = typeof task === "string" ? task : task.name;
    delete this.mockedTasks[id];
  }

  public clearMocks() {
    this.mockedTasks = {};
  }

  public override getTask(taskId: string): Task | undefined {
    if (taskId in this.mockedTasks) {
      const mock = this.mockedTasks[taskId]!;
      return {
        name: taskId,
        handler: (input, context) => mock.call(input, context),
      } as Task;
    }
    const task = tasks()[taskId];
    if (!task) {
      throw new Error("Task not found: " + taskId);
    }
    return task;
  }
}

export type AsyncResultTokenCallback = (token: string) => void;

/**
 * A mock task which provides fine grained control over the results of the task when
 * called by the workflow within a {@link TestEnvironment}.
 */
export interface IMockTask<Input = any, Output = any> {
  /**
   * Imitates the {@link asyncResult} behavior of a task.
   *
   * A token is generated and the task must be succeeded or failed using the token.
   *
   * To get the token, use the tokenCallback argument.
   *
   * ```ts
   * let taskToken;
   * mockTask.asyncResult(token => { taskToken = token; });
   * // start workflow
   * await env.sendTaskSuccess({ taskToken, result: "some result" });
   * ```
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  asyncResult(
    tokenCallback?: AsyncResultTokenCallback
  ): IMockTask<Input, Output>;
  /**
   * Imitates the {@link asyncResult} behavior of a task for one invocation.
   *
   * A token is generated and the task must be succeeded or failed using the token.
   *
   * To get the token, use the tokenCallback argument.
   *
   * ```ts
   * let taskToken;
   * mockTask.asyncResultOnce(token => { taskToken = token; });
   * // start workflow
   * await env.sendTaskSuccess({ taskToken, result: "some result" });
   * ```
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  asyncResultOnce(
    tokenCallback?: AsyncResultTokenCallback
  ): IMockTask<Input, Output>;
  /**
   * Succeeds the task with a given value.
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  succeed(output: Output): IMockTask<Input, Output>;
  /**
   * Succeeds the task once with a given value.
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  succeedOnce(output: Output): IMockTask<Input, Output>;
  /**
   * Fails the task with a given error.
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  fail(error: Error): IMockTask<Input, Output>;
  fail(error: string, message: string): IMockTask<Input, Output>;
  /**
   * Fails the task once with a given error.
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  failOnce(error: Error): IMockTask<Input, Output>;
  failOnce(error: string, message: string): IMockTask<Input, Output>;
  /**
   * When the task is invoked, the given callback will be called with the values given.
   *
   * The callback can return values, throw errors, or return {@link asyncResult}.
   *
   * ```ts
   * mockTask.invoke(async (arg1, arg2) => { return arg1 + arg2; });
   * ```
   *
   * This method could be used with a mocks library like `jest` to provide invocation metrics and matchers.
   *
   * ```
   * const mockTask = env.mockTask(myTask);
   * const mockTaskHandler = jest.fn<myTask>();
   * mockTask.invoke(mockTaskHandler);
   * // start workflow
   * expect(mockTaskHandler).toBeCalledTimes(10);
   * ```
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  invoke(handler: TaskHandler<Input, Output>): IMockTask<Input, Output>;
  /**
   * When the task is invoked, the given callback will be called once with the values given.
   *
   * The callback can return values, throw errors, or return {@link asyncResult}.
   *
   * ```ts
   * mockTask.invoke(async (arg1, arg2) => { return arg1 + arg2; });
   * ```
   *
   * This method could be used with a mocks library like `jest` to provide invocation metrics and matchers.
   *
   * ```
   * const mockTask = env.mockTask(myTask);
   * const mockTaskHandler = jest.fn<myTask>();
   * mockTask.invoke(mockTaskHandler);
   * // start workflow
   * expect(mockTaskHandler).toBeCalledTimes(10);
   * ```
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  invokeOnce(handler: TaskHandler<Input, Output>): IMockTask<Input, Output>;
  /**
   * Fails the task with a {@link Timeout} error.
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  timeout(): IMockTask<Input, Output>;
  /**
   * Fails the task once with a {@link Timeout} error.
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  timeoutOnce(): IMockTask<Input, Output>;
  /**
   * Fails the task with a {@link HeartbeatTimeout} error.
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  heartbeatTimeout(): IMockTask<Input, Output>;
  /**
   * Fails the task once with a {@link HeartbeatTimeout} error.
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  heartbeatTimeoutOnce(): IMockTask<Input, Output>;
  /**
   * Invokes the real handler, this can be used to revert back to the real task handler without
   * using {@link TestEnvironment.restMocks()} or to maintain the current once resolutions while still
   * invoking the real function.
   *
   * ```ts
   * const mockTask = env.mockTask(myTask);
   * // fail on the first invocation and then call the real handler for all future invocations.
   * mockTask.failOnce(new Error()).invokeReal();
   * ```
   *
   * The task will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  invokeReal(): IMockTask<Input, Output>;
  /**
   * Invokes the real handler once, this can be used to revert back to the real task handler without
   * using {@link TestEnvironment.restMocks()} or to maintain the current once resolutions while still
   * invoking the real function.
   *
   * ```ts
   * const mockTask = env.mockTask(myTask);
   * // fail on the first invocation, then invoke the real handler, then succeed all future calls.
   * mockTask.failOnce(new Error()).invokeRealOnce().succeed("test result!");
   * ```
   *
   * The task will use this resolution once all previous once resolutions are consumed.
   */
  invokeRealOnce(): IMockTask<Input, Output>;
}

export type TaskResolution<Input = any, Output = any> =
  | AsyncResultResolution
  | Failed
  | InvokeRealResolution
  | InvokeResolution<Input, Output>
  | Resolved<any>;

export interface InvokeResolution<Input = any, Output = any> {
  handler: TaskHandler<Input, Output>;
}

export interface InvokeRealResolution {
  real: true;
}

export interface AsyncResultResolution {
  asyncResult: true;
  tokenCallback?: AsyncResultTokenCallback;
}

export class MockTask<A extends Task<any, any>>
  implements IMockTask<TaskInput<A>, TaskOutput<A>>
{
  private onceResolutions: TaskResolution<TaskInput<A>, TaskOutput<A>>[] = [];

  private resolution: TaskResolution<TaskInput<A>, TaskOutput<A>> | undefined;

  constructor(private task: A) {}

  public call(input: TaskInput<A>, context: TaskContext) {
    const before = this.onceResolutions.shift();
    if (before) {
      return this.resolve(before, input, context);
    } else if (this.resolution) {
      return this.resolve(this.resolution, input, context);
    }
    return undefined;
  }

  private resolve(
    resolution: TaskResolution<TaskInput<A>, TaskOutput<A>>,
    input: TaskInput<A>,
    context: TaskContext
  ) {
    if ("real" in resolution) {
      return this.task(input);
    } else if (isResult(resolution)) {
      if (isResolved(resolution)) {
        return resolution.value;
      } else if (isFailed(resolution)) {
        throw resolution.error;
      }
    } else if ("handler" in resolution) {
      return resolution.handler(input, context);
    } else if ("asyncResult" in resolution) {
      return asyncResult(
        resolution.tokenCallback
          ? resolution.tokenCallback
          : () => {
              return undefined;
            }
      );
    }
    return assertNever(resolution);
  }

  public succeed(
    output: TaskOutput<A>
  ): IMockTask<TaskInput<A>, TaskOutput<A>> {
    return this.setResolution(Result.resolved(output));
  }

  public succeedOnce(
    output: TaskOutput<A>
  ): IMockTask<TaskInput<A>, TaskOutput<A>> {
    return this.addOnceResolution(Result.resolved(output));
  }

  public fail(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.setResolution(Result.failed(error));
  }

  public failOnce(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.addOnceResolution(Result.failed(error));
  }

  public timeout() {
    return this.setResolution(Result.failed(new Timeout()));
  }

  public timeoutOnce() {
    return this.addOnceResolution(Result.failed(new Timeout()));
  }

  public heartbeatTimeout() {
    return this.setResolution(Result.failed(new Timeout()));
  }

  public heartbeatTimeoutOnce() {
    return this.addOnceResolution(Result.failed(new HeartbeatTimeout()));
  }

  public invoke(
    handler: TaskHandler<TaskInput<A>, TaskOutput<A>>
  ): IMockTask<TaskInput<A>, TaskOutput<A>> {
    return this.setResolution({ handler });
  }

  public invokeOnce(
    handler: TaskHandler<TaskInput<A>, TaskOutput<A>>
  ): IMockTask<TaskInput<A>, TaskOutput<A>> {
    return this.addOnceResolution({ handler });
  }

  public invokeReal() {
    return this.setResolution({ real: true });
  }

  public invokeRealOnce() {
    return this.addOnceResolution({ real: true });
  }

  public asyncResult(tokenCallback?: AsyncResultTokenCallback) {
    return this.setResolution({ asyncResult: true, tokenCallback });
  }

  public asyncResultOnce(tokenCallback?: AsyncResultTokenCallback) {
    return this.addOnceResolution({ asyncResult: true, tokenCallback });
  }

  private setResolution(
    resolution: TaskResolution<TaskInput<A>, TaskOutput<A>>
  ) {
    this.resolution = resolution;
    return this;
  }

  private addOnceResolution(
    resolution: TaskResolution<TaskInput<A>, TaskOutput<A>>
  ) {
    this.onceResolutions.push(resolution);
    return this;
  }
}
