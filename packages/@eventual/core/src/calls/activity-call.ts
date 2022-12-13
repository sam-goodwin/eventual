import {
  ActivityExecutionReference,
  ActivityTarget,
  ActivityTargetType,
} from "../activity.js";
import { ActivityCancelled, EventualError } from "../error.js";
import {
  EventualKind,
  isEventualOfKind,
  createEventual,
  CommandCallBase,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Failed, Result } from "../result.js";

export function isActivityCall(a: any): a is ActivityCall {
  return isEventualOfKind(EventualKind.ActivityCall, a);
}

export interface ActivityCall<T = any>
  extends CommandCallBase<EventualKind.ActivityCall, Resolved<T> | Failed>,
    ActivityExecutionReference<T> {
  name: string;
  args: any[];
  heartbeatSeconds?: number;
  timeoutSeconds?: number;
}

export function createActivityCall(
  name: string,
  args: any[],
  timeoutSeconds?: number,
  heartbeatSeconds?: number
): ActivityCall {
  const call = registerEventual<ActivityCall>(
    createEventual(EventualKind.ActivityCall, {
      name,
      args,
      timeoutSeconds,
      heartbeatSeconds,
    } as ActivityCall)
  );

  call.complete = function (result) {
    return createOverrideActivityCall(
      { type: ActivityTargetType.OwnActivity, seq: this.seq! },
      Result.resolved(result)
    ) as unknown as Promise<void>;
  };
  call.fail = function (...args) {
    return createOverrideActivityCall(
      { type: ActivityTargetType.OwnActivity, seq: this.seq! },
      Result.failed(
        args.length === 1 ? args[0] : new EventualError(args[0], args[1])
      )
    ) as unknown as Promise<void>;
  };
  call.cancel = function (reason) {
    return createOverrideActivityCall(
      { type: ActivityTargetType.OwnActivity, seq: this.seq! },
      Result.failed(new ActivityCancelled(reason))
    ) as unknown as Promise<void>;
  };

  return call;
}

export function isOverrideActivityCall(a: any): a is OverrideActivityCall {
  return isEventualOfKind(EventualKind.OverrideActivityCall, a);
}

export interface OverrideActivityCall
  extends CommandCallBase<EventualKind.OverrideActivityCall, Resolved> {
  target: ActivityTarget;
  outcome: Resolved | Failed;
}

export function createOverrideActivityCall(
  target: ActivityTarget,
  outcome: Resolved | Failed
): OverrideActivityCall {
  return registerEventual(
    createEventual<OverrideActivityCall>(EventualKind.OverrideActivityCall, {
      target,
      outcome,
      result: Result.resolved(undefined),
    })
  );
}
