import { resetActivities, resetActivityIDCounter } from "./activity";
import {
  resetCurrentThreadID,
  resetThreadIDCounter,
  scheduleThread,
} from "./thread";

export function eventual<
  F extends (...args: any[]) => Generator<any, any, any>
>(func: F): F {
  return ((...args: any[]) => scheduleThread(func(...args))) as any;
}

export function reset() {
  resetActivities();
  resetActivityIDCounter();
  resetThreadIDCounter();
  resetCurrentThreadID();
}
