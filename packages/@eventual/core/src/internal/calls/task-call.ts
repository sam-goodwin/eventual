import { DurationSchedule } from "../../schedule.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isTaskCall(a: any): a is TaskCall {
  return isEventualCallOfKind(EventualCallKind.TaskCall, a);
}

export interface TaskCall extends EventualCallBase<EventualCallKind.TaskCall> {
  name: string;
  input: any;
  heartbeat?: DurationSchedule;
  /**
   * Timeout can be any Eventual (promise). When the promise resolves, the task is considered to be timed out.
   */
  timeout?: Promise<any>;
}
