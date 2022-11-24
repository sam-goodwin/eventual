import {
  isEventual,
  EventualSymbol,
  EventualKind,
  Eventual,
  AwaitedEventual,
  EventualBase,
} from "./eventual.js";
import { registerActivity } from "./global.js";
import { Program } from "./interpret.js";
import { Result } from "./result.js";

export function isChain(a: any): a is Chain {
  return isEventual(a) && a[EventualSymbol] === EventualKind.Chain;
}

export interface Chain<T = any> extends Program<T>, EventualBase<Result<T>> {
  [EventualSymbol]: EventualKind.Chain;
  awaiting?: Eventual;
}

export function chain<F extends (...args: any[]) => Program>(
  func: F
): (...args: Parameters<F>) => Chain<AwaitedEventual<ReturnType<F>>> {
  return ((...args: any[]) => {
    const generator = func(...args);
    return registerChain(generator);
  }) as any;
}

export function createChain(program: Program): Chain {
  (program as any)[EventualSymbol] = EventualKind.Chain;
  return program as Chain;
}

export function registerChain(program: Program): Chain {
  return registerActivity(createChain(program));
}
