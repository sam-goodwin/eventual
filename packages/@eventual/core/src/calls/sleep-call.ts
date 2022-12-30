import {
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Failed, Resolved } from "../result.js";
import { SleepWhilePredicate } from "../sleep.js";

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

export function isSleepWhileCall(a: any): a is SleepWhileCall<any> {
  return isEventualOfKind(EventualKind.SleepWhileCall, a);
}

export interface SleepWhileCall<T = any>
  extends EventualBase<EventualKind.SleepWhileCall, Resolved<T> | Failed> {
  seq?: number;
  predicate: SleepWhilePredicate<T>;
  not: boolean;
  timeoutSeconds?: number;
}

export function createSleepWhileCall(
  predicate: SleepWhilePredicate,
  not: boolean,
  timeoutSeconds?: number
) {
  return registerEventual(
    createEventual<SleepWhileCall<any>>(EventualKind.SleepWhileCall, {
      predicate,
      not,
      timeoutSeconds,
    })
  );
}
