import {
  ActivityExecutionReference,
  ActivityTarget,
  ActivityTargetType,
} from "../activity.js";
import { ActivityCancelled } from "../error.js";
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
    ActivityExecutionReference {
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
