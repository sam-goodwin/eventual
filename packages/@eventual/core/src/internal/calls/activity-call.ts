import { DurationSchedule } from "../../schedule.js";
import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
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

export function createActivityCall<T>(
  name: string,
  input: any,
  timeout?: Promise<any>,
  heartbeat?: DurationSchedule
): EventualPromise<T> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.ActivityCall, {
      name,
      input,
      timeout,
      heartbeat,
    })
  );
}
