import { Program } from "./interpret";
import { scheduleThread, Thread } from "./thread";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Program<Awaited<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => Program>(
  func: F
): (...args: Parameters<F>) => Thread<ReturnType<F>>;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => {
    const generator = func(...args);
    return scheduleThread(generator);
  }) as any;
}
