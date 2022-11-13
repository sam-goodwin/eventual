import { Activity } from "./activity";
import { Program } from "./interpret";
import { scheduleThread, Thread } from "./thread";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Program<Awaited<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => Program>(
  func: F
): (...args: Parameters<F>) => Thread<Resolved<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => {
    const generator = func(...args);
    return scheduleThread(generator);
  }) as any;
}

type Resolved<T> = T extends Program<infer U>
  ? Resolved<U>
  : T extends Activity<infer U>
  ? Resolved<U>
  : T;
