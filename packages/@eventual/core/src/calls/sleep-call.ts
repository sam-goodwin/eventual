import {
  EventualKind,
  isEventualOfKind,
  createEventual,
  CommandCallBase,
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
  extends CommandCallBase<EventualKind.SleepForCall, Resolved<undefined>> {
  durationSeconds: number;
}

export interface SleepUntilCall
  extends CommandCallBase<EventualKind.SleepUntilCall, Resolved<undefined>> {
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
