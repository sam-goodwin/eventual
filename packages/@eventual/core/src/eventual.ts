import { scheduleThread, Thread } from "./thread";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Thread;

export function eventual<
  F extends (...args: any[]) => Generator<any, any, any>
>(func: F): (...args: any[]) => Thread;

export function eventual<F extends (...args: any[]) => any>(
  func: F
): (...args: any[]) => Thread {
  return ((...args: any[]) => scheduleThread(func(...args))) as any;
}
