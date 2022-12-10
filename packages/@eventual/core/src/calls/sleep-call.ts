import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved } from "../result.js";

export function isSleepForCall(a: any): a is SleepForCall {
  return isEventualOfKind(EventualKind.SleepForCall, a);
}

export function isSleepUntilCall(a: any): a is SleepUntilCall {
  return isEventualOfKind(EventualKind.SleepUntilCall, a);
}

export interface SleepForCall
  extends EventualBase<EventualKind.SleepForCall, Resolved<undefined>> {
  seq?: number;
  durationSeconds: number;
}

export interface SleepUntilCall
  extends EventualBase<EventualKind.SleepUntilCall, Resolved<undefined>> {
  seq?: number;
  isoDate: string;
}

export function createSleepForCall(durationSeconds: number): SleepForCall {
  return registerEventual(
    createEventual(EventualKind.SleepForCall, {
      durationSeconds,
    })
  );
}

export function createSleepUntilCall(isoDate: string): SleepUntilCall {
  return registerEventual(
    createEventual(EventualKind.SleepUntilCall, {
      isoDate,
    })
  );
}
