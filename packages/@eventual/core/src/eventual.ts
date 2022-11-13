import { Future } from "./future";
import { Program } from "./interpret";
import { registerChain, Chain } from "./chain";

export function eventual<F extends (...args: any[]) => Promise<any>>(
  func: F
): (...args: Parameters<F>) => Program<Awaited<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => Program>(
  func: F
): (...args: Parameters<F>) => Chain<Resolved<ReturnType<F>>>;

export function eventual<F extends (...args: any[]) => any>(func: F): F {
  return ((...args: any[]) => {
    const generator = func(...args);
    return registerChain(generator);
  }) as any;
}

type Resolved<T> = T extends Program<infer U>
  ? Resolved<U>
  : T extends Future<infer U>
  ? Resolved<U>
  : T;
