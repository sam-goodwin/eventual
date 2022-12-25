import {
  ActivityArguments,
  ActivityFunction,
  ActivityOutput,
  assertNever,
  asyncResult,
  callableActivities,
  EventualError,
  Failed,
  HeartbeatTimeout,
  isFailed,
  isResolved,
  isResult,
  Resolved,
  Result,
  ServiceType,
  Timeout,
} from "@eventual/core";
import { serviceTypeScope } from "./utils.js";

export class ActivitiesController {
  private mockedActivities: Record<string, MockActivity<any>> = {};

  mockActivity<A extends ActivityFunction<any, any>>(activity: A | string) {
    const id = typeof activity === "string" ? activity : activity.activityID;
    const realActivity =
      typeof activity === "string" ? callableActivities()[id] : activity;
    if (!realActivity) {
      throw new Error("Activity being mocked does not exist. " + id);
    }

    const mock = new MockActivity<any>((...args: any[]) =>
      realActivity(...args)
    );

    this.mockedActivities[id] = mock;

    return mock;
  }

  clearMock(activity: ActivityFunction<any, any> | string) {
    const id = typeof activity === "string" ? activity : activity.activityID;
    delete this.mockedActivities[id];
  }

  clearMocks() {
    this.mockedActivities = {};
  }

  async invokeActivity(activityId: string, ...args: any[]) {
    return serviceTypeScope(ServiceType.ActivityWorker, () => {
      if (activityId in this.mockedActivities) {
        const mock = this.mockedActivities[activityId]!;
        return mock.call(...args);
      } else {
        const activity = callableActivities()[activityId];
        if (!activity) {
          throw new Error("Activity not found: " + activityId);
        }
        return activity(...args);
      }
    });
  }
}

export interface IMockActivity<
  Arguments extends any[] = any[],
  Output extends any = any
> {
  block(): IMockActivity<Arguments, Output>;
  blockOnce(): IMockActivity<Arguments, Output>;
  complete(output: Output): IMockActivity<Arguments, Output>;
  completeOnce(output: Output): IMockActivity<Arguments, Output>;
  fail(error: Error): IMockActivity<Arguments, Output>;
  fail(error: string, message: string): IMockActivity<Arguments, Output>;
  failOnce(error: Error): IMockActivity<Arguments, Output>;
  failOnce(error: string, message: string): IMockActivity<Arguments, Output>;
  invoke(
    handler: (...args: Arguments) => Promise<Output> | Output
  ): IMockActivity<Arguments, Output>;
  invokeOnce(
    handler: (...args: Arguments) => Promise<Output> | Output
  ): IMockActivity<Arguments, Output>;
  timeout(): IMockActivity<Arguments, Output>;
  timeoutOnce(): IMockActivity<Arguments, Output>;
  heartbeatTimeout(): IMockActivity<Arguments, Output>;
  heartbeatTimeoutOnce(): IMockActivity<Arguments, Output>;
  invokeReal(): IMockActivity<Arguments, Output>;
  invokeRealOnce(): IMockActivity<Arguments, Output>;
}

export type ActivityResolution<
  Arguments extends any[] = any[],
  Output extends any = any
> =
  | BlockResolution
  | Failed
  | InvokeRealResolution
  | InvokeResolution<Arguments, Output>
  | Resolved<any>;

export interface InvokeResolution<
  Arguments extends any[] = any[],
  Output extends any = any
> {
  handler: (...args: Arguments) => Promise<Output> | Output;
}

export interface InvokeRealResolution {
  real: true;
}

export interface BlockResolution {
  block: true;
}

export class MockActivity<A extends ActivityFunction<any, any>>
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
    const before = this.onceResolutions.pop();
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
    } else if ("block" in resolution) {
      return asyncResult(() => {});
    }
    return assertNever(resolution);
  }

  public complete(
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addResolution(Result.resolved(output));
  }
  public completeOnce(
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addOnceResolution(Result.resolved(output));
  }
  public fail(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.addResolution(Result.failed(error));
  }
  public failOnce(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.addOnceResolution(Result.failed(error));
  }
  public timeout() {
    return this.addResolution(Result.failed(new Timeout()));
  }
  public timeoutOnce() {
    return this.addOnceResolution(Result.failed(new Timeout()));
  }
  public heartbeatTimeout() {
    return this.addResolution(Result.failed(new Timeout()));
  }
  public heartbeatTimeoutOnce() {
    return this.addOnceResolution(Result.failed(new HeartbeatTimeout()));
  }
  public invoke(
    handler: (
      ...args: ActivityArguments<A>
    ) => ActivityOutput<A> | Promise<ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addResolution({ handler });
  }
  public invokeOnce(
    handler: (
      ...args: ActivityArguments<A>
    ) => ActivityOutput<A> | Promise<ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addOnceResolution({ handler });
  }
  public invokeReal() {
    return this.addResolution({ real: true });
  }
  public invokeRealOnce() {
    return this.addOnceResolution({ real: true });
  }
  public block() {
    return this.addResolution({ block: true });
  }
  public blockOnce() {
    return this.addOnceResolution({ block: true });
  }

  private addResolution(
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
