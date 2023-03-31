import { Schedule } from "../../schedule.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isAwaitTimerCall(a: any): a is AwaitTimerCall {
  return isEventualCallOfKind(EventualCallKind.AwaitTimerCall, a);
}

export interface AwaitTimerCall
  extends EventualCallBase<EventualCallKind.AwaitTimerCall> {
  schedule: Schedule;
}
