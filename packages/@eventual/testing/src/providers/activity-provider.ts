import {
  ActivityArguments,
  Activity,
  ActivityHandler,
  ActivityOutput,
  asyncResult,
  EventualError,
  HeartbeatTimeout,
  Timeout,
} from "@eventual/core";
import { GlobalActivityProvider } from "@eventual/core-runtime";
import {
  callableActivities,
  Failed,
  Resolved,
  isResult,
  isResolved,
  isFailed,
  assertNever,
  Result,
} from "@eventual/core/internal";

export class MockableActivityProvider extends GlobalActivityProvider {
  private mockedActivities: Record<string, MockActivity<any>> = {};

  public mockActivity<A extends Activity<any, any>>(activity: A | string) {
    const id = typeof activity === "string" ? activity : activity.activityID;
    const realActivity =
      typeof activity === "string" ? super.getActivityHandler(id) : activity;
    if (!realActivity) {
      throw new Error("Activity being mocked does not exist. " + id);
    }

    const mock = new MockActivity<any>((...args: any[]) =>
      realActivity(...args)
    );

    this.mockedActivities[id] = mock;

    return mock;
  }

  public clearMock(activity: Activity<any, any> | string) {
    const id = typeof activity === "string" ? activity : activity.activityID;
    delete this.mockedActivities[id];
  }

  public clearMocks() {
    this.mockedActivities = {};
  }

  public override getActivityHandler(
    activityId: string
  ): ActivityHandler<any, any> | undefined {
    if (activityId in this.mockedActivities) {
      const mock = this.mockedActivities[activityId]!;
      return (...args) => mock.call(...args);
    }
    const activity = callableActivities()[activityId];
    if (!activity) {
      throw new Error("Activity not found: " + activityId);
    }
    return activity;
  }
}

export type AsyncResultTokenCallback = (token: string) => void;

/**
 * A mock activity which provides fine grained control over the results of the activity when
 * called by the workflow within a {@link TestEnvironment}.
 */
export interface IMockActivity<Arguments extends any[] = any[], Output = any> {
  /**
   * Imitates the {@link asyncResult} behavior of an activity.
   *
   * A token is generated and the activity must be succeeded or failed using the token.
   *
   * To get the token, use the tokenCallback argument.
   *
   * ```ts
   * let activityToken;
   * mockActivity.asyncResult(token => { activityToken = token; });
   * // start workflow
   * await env.sendActivitySuccess({ activityToken, result: "some result" });
   * ```
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  asyncResult(
    tokenCallback?: AsyncResultTokenCallback
  ): IMockActivity<Arguments, Output>;
  /**
   * Imitates the {@link asyncResult} behavior of an activity for one invocation.
   *
   * A token is generated and the activity must be succeeded or failed using the token.
   *
   * To get the token, use the tokenCallback argument.
   *
   * ```ts
   * let activityToken;
   * mockActivity.asyncResultOnce(token => { activityToken = token; });
   * // start workflow
   * await env.sendActivitySuccess({ activityToken, result: "some result" });
   * ```
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  asyncResultOnce(
    tokenCallback?: AsyncResultTokenCallback
  ): IMockActivity<Arguments, Output>;
  /**
   * Succeeds the activity with a given value.
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  succeed(output: Output): IMockActivity<Arguments, Output>;
  /**
   * Succeeds the activity once with a given value.
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  succeedOnce(output: Output): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity with a given error.
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  fail(error: Error): IMockActivity<Arguments, Output>;
  fail(error: string, message: string): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity once with a given error.
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  failOnce(error: Error): IMockActivity<Arguments, Output>;
  failOnce(error: string, message: string): IMockActivity<Arguments, Output>;
  /**
   * When the activity is invoked, the given callback will be called with the values given.
   *
   * The callback can return values, throw errors, or return {@link asyncResult}.
   *
   * ```ts
   * mockActivity.invoke(async (arg1, arg2) => { return arg1 + arg2; });
   * ```
   *
   * This method could be used with a mocks library like `jest` to provide invocation metrics and matchers.
   *
   * ```
   * const mockActivity = env.mockActivity(myActivity);
   * const mockActivityHandler = jest.fn<myActivity>();
   * mockActivity.invoke(mockActivityHandler);
   * // start workflow
   * expect(mockActivityHandler).toBeCalledTimes(10);
   * ```
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  invoke(
    handler: ActivityHandler<Arguments, Output>
  ): IMockActivity<Arguments, Output>;
  /**
   * When the activity is invoked, the given callback will be called once with the values given.
   *
   * The callback can return values, throw errors, or return {@link asyncResult}.
   *
   * ```ts
   * mockActivity.invoke(async (arg1, arg2) => { return arg1 + arg2; });
   * ```
   *
   * This method could be used with a mocks library like `jest` to provide invocation metrics and matchers.
   *
   * ```
   * const mockActivity = env.mockActivity(myActivity);
   * const mockActivityHandler = jest.fn<myActivity>();
   * mockActivity.invoke(mockActivityHandler);
   * // start workflow
   * expect(mockActivityHandler).toBeCalledTimes(10);
   * ```
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  invokeOnce(
    handler: ActivityHandler<Arguments, Output>
  ): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity with a {@link Timeout} error.
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  timeout(): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity once with a {@link Timeout} error.
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  timeoutOnce(): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity with a {@link HeartbeatTimeout} error.
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  heartbeatTimeout(): IMockActivity<Arguments, Output>;
  /**
   * Fails the activity once with a {@link HeartbeatTimeout} error.
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  heartbeatTimeoutOnce(): IMockActivity<Arguments, Output>;
  /**
   * Invokes the real handler, this can be used to revert back to the real activity handler without
   * using {@link TestEnvironment.restMocks()} or to maintain the current once resolutions while still
   * invoking the real function.
   *
   * ```ts
   * const mockActivity = env.mockActivity(myActivity);
   * // fail on the first invocation and then call the real handler for all future invocations.
   * mockActivity.failOnce(new Error()).invokeReal();
   * ```
   *
   * The activity will use this resolution after all once resolutions are
   * consumed and until another resolution is given.
   */
  invokeReal(): IMockActivity<Arguments, Output>;
  /**
   * Invokes the real handler once, this can be used to revert back to the real activity handler without
   * using {@link TestEnvironment.restMocks()} or to maintain the current once resolutions while still
   * invoking the real function.
   *
   * ```ts
   * const mockActivity = env.mockActivity(myActivity);
   * // fail on the first invocation, then invoke the real handler, then succeed all future calls.
   * mockActivity.failOnce(new Error()).invokeRealOnce().succeed("test result!");
   * ```
   *
   * The activity will use this resolution once all previous once resolutions are consumed.
   */
  invokeRealOnce(): IMockActivity<Arguments, Output>;
}

export type ActivityResolution<Arguments extends any[] = any[], Output = any> =
  | AsyncResultResolution
  | Failed
  | InvokeRealResolution
  | InvokeResolution<Arguments, Output>
  | Resolved<any>;

export interface InvokeResolution<
  Arguments extends any[] = any[],
  Output = any
> {
  handler: ActivityHandler<Arguments, Output>;
}

export interface InvokeRealResolution {
  real: true;
}

export interface AsyncResultResolution {
  asyncResult: true;
  tokenCallback?: AsyncResultTokenCallback;
}

export class MockActivity<A extends Activity<any, any>>
  implements IMockActivity<ActivityArguments<A>, ActivityOutput<A>>
{
  private onceResolutions: ActivityResolution<
    ActivityArguments<A>,
    ActivityOutput<A>
  >[] = [];

  private resolution:
    | ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
    | undefined;

  // TODO: should this be the ActivityFunction or the ActivityHandler?
  constructor(private activity: A) {}

  public call(...args: ActivityArguments<A>) {
    const before = this.onceResolutions.shift();
    if (before) {
      return this.resolve(before, args);
    } else if (this.resolution) {
      return this.resolve(this.resolution, args);
    }
    return undefined;
  }

  private resolve(
    resolution: ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>,
    args: ActivityArguments<A>
  ) {
    if ("real" in resolution) {
      return this.activity(...(args as any[]));
    } else if (isResult(resolution)) {
      if (isResolved(resolution)) {
        return resolution.value;
      } else if (isFailed(resolution)) {
        throw resolution.error;
      }
    } else if ("handler" in resolution) {
      return resolution.handler(...args);
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
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.setResolution(Result.resolved(output));
  }

  public succeedOnce(
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
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
    handler: ActivityHandler<ActivityArguments<A>, ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.setResolution({ handler });
  }

  public invokeOnce(
    handler: ActivityHandler<ActivityArguments<A>, ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
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
    resolution: ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
  ) {
    this.resolution = resolution;
    return this;
  }

  private addOnceResolution(
    resolution: ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
  ) {
    this.onceResolutions.push(resolution);
    return this;
  }
}
