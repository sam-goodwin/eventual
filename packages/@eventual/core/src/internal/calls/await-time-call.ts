import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved } from "../result.js";
import { DurationUnit } from "../../schedule.js";

export function isAwaitDurationCall(a: any): a is AwaitDurationCall {
  return isEventualOfKind(EventualKind.AwaitDurationCall, a);
}

export function isAwaitTimeCall(a: any): a is AwaitTimeCall {
  return isEventualOfKind(EventualKind.AwaitTimeCall, a);
}

export interface AwaitDurationCall
  extends EventualBase<EventualKind.AwaitDurationCall, Resolved<undefined>> {
  seq?: number;
  dur: number;
  unit: DurationUnit;
}

export interface AwaitTimeCall
  extends EventualBase<EventualKind.AwaitTimeCall, Resolved<undefined>> {
  seq?: number;
  isoDate: string;
}

export function createAwaitDurationCall(
  dur: number,
  unit: DurationUnit
): AwaitDurationCall {
  return registerEventual(
    createEventual(EventualKind.AwaitDurationCall, {
      dur,
      unit,
    })
  );
}

export function createAwaitTimeCall(isoDate: string): AwaitTimeCall {
  return registerEventual(
    createEventual(EventualKind.AwaitTimeCall, {
      isoDate,
    })
  );
}
