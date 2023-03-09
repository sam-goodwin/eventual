import { Schedule } from "../../schedule.js";
import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind
} from "./calls.js";

export function isAwaitTimerCall(a: any): a is AwaitTimerCall {
  return isEventualCallOfKind(EventualCallKind.AwaitTimerCall, a);
}

export interface AwaitTimerCall
  extends EventualCallBase<EventualCallKind.AwaitTimerCall> {
  schedule: Schedule;
}

export function createAwaitTimerCall(
  schedule: Schedule
): EventualPromise<void> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall<AwaitTimerCall>(EventualCallKind.AwaitTimerCall, {
      schedule,
    })
  );
}
