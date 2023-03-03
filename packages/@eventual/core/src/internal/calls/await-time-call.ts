import { DurationUnit } from "../../schedule.js";
import { EventualPromise, getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isAwaitDurationCall(a: any): a is AwaitDurationCall {
  return isEventualCallOfKind(EventualCallKind.AwaitDurationCall, a);
}

export function isAwaitTimeCall(a: any): a is AwaitTimeCall {
  return isEventualCallOfKind(EventualCallKind.AwaitTimeCall, a);
}

export interface AwaitDurationCall
  extends EventualCallBase<EventualCallKind.AwaitDurationCall> {
  dur: number;
  unit: DurationUnit;
}

export interface AwaitTimeCall
  extends EventualCallBase<EventualCallKind.AwaitTimeCall> {
  isoDate: string;
}

export function createAwaitDurationCall(
  dur: number,
  unit: DurationUnit
): EventualPromise<void> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.AwaitDurationCall, {
      dur,
      unit,
    })
  );
}

export function createAwaitTimeCall(isoDate: string): EventualPromise<void> {
  return getWorkflowHook().registerEventualCall(
    createEventualCall(EventualCallKind.AwaitTimeCall, {
      isoDate,
    })
  );
}
