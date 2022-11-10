import { resetActivities, resetActivityIDCounter } from "./activity";
import {
  resetCurrentThreadID,
  resetThreadIDCounter,
  scheduleThread,
} from "./thread";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Generator<any, Awaited<ReturnType<F>>, any>;

export function eventual<
  F extends (...args: any[]) => Generator<any, any, any>
>(func: F): F;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => scheduleThread(func(...args))) as any;
}

export function reset() {
  resetActivities();
  resetActivityIDCounter();
  resetThreadIDCounter();
  resetCurrentThreadID();
}
