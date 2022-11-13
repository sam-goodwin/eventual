import { scheduleThread } from "./thread";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Generator<any, Awaited<ReturnType<F>>, any>;

export function eventual<
  F extends (...args: any[]) => Generator<any, any, any>
>(func: F): F;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => {
    const generator = func(...args);
    return scheduleThread(generator);
  }) as any;
}
