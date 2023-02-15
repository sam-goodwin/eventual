import {
  createEventual,
  Eventual,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Failed, Resolved } from "../result.js";
import { DurationSchedule } from "../../schedule.js";

export function isActivityCall(a: any): a is ActivityCall {
  return isEventualOfKind(EventualKind.ActivityCall, a);
}

export interface ActivityCall<T = any>
  extends EventualBase<EventualKind.ActivityCall, Resolved<T> | Failed> {
  seq?: number;
  name: string;
  args: any[];
  heartbeat?: DurationSchedule;
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the activity is considered to be timed out.
   */
  timeout?: Eventual;
}

export function createActivityCall(
  name: string,
  args: any[],
  timeout?: Eventual,
  heartbeat?: DurationSchedule
): ActivityCall {
  return registerEventual(
    createEventual(EventualKind.ActivityCall, {
      name,
      args,
      timeout,
      heartbeat,
    })
  );
}
