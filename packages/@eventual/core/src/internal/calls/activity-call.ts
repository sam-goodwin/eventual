import { DurationSchedule } from "../../schedule.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isActivityCall(a: any): a is ActivityCall {
  return isEventualCallOfKind(EventualCallKind.ActivityCall, a);
}

export interface ActivityCall
  extends EventualCallBase<EventualCallKind.ActivityCall> {
  name: string;
  input: any;
  heartbeat?: DurationSchedule;
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the activity is considered to be timed out.
   */
  timeout?: Promise<any>;
}
