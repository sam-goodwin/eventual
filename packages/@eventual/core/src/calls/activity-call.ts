import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Failed } from "../result.js";

export function isActivityCall(a: any): a is ActivityCall {
  return isEventualOfKind(EventualKind.ActivityCall, a);
}

export interface ActivityCall<T = any>
  extends EventualBase<EventualKind.ActivityCall, Resolved<T> | Failed> {
  seq?: number;
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
  return registerEventual(
    createEventual(EventualKind.ActivityCall, {
      name,
      args,
      timeoutSeconds,
      heartbeatSeconds,
    })
  );
}
