import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
  Eventual,
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
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the activity is considered to be timed out.
   */
  timeout?: Eventual;
}

export function createActivityCall(
  name: string,
  args: any[],
  timeout?: Eventual,
  heartbeatSeconds?: number
): ActivityCall {
  return registerEventual(
    createEventual(EventualKind.ActivityCall, {
      name,
      args,
      timeout,
      heartbeatSeconds,
    })
  );
}
