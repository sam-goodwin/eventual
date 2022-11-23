import {
  EventualSymbol,
  EventualKind,
  isEventual,
  EventualBase,
} from "./eventual.js";
import { registerActivity } from "./global.js";
import { Resolved } from "./result.js";

export function isSleepForCall(a: any): a is SleepForCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.SleepForCall;
}

export function isSleepUntilCall(a: any): a is SleepUntilCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.SleepUntilCall;
}

export interface SleepForCall extends EventualBase<Resolved<undefined>> {
  [EventualSymbol]: EventualKind.SleepForCall;
  seq?: number;
  durationSeconds: number;
}

export interface SleepUntilCall extends EventualBase<Resolved<undefined>> {
  [EventualSymbol]: EventualKind.SleepUntilCall;
  seq?: number;
  isoDate: string;
}

export function createSleepForCall(durationSeconds: number): SleepForCall {
  const command: SleepForCall = {
    [EventualSymbol]: EventualKind.SleepForCall,
    durationSeconds,
  };
  return registerActivity(command);
}

export function createSleepUntilCall(isoDate: string): SleepUntilCall {
  const command: SleepUntilCall = {
    [EventualSymbol]: EventualKind.SleepUntilCall,
    isoDate,
  };
  return registerActivity(command);
}
