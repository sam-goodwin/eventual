import {
  EventualKind,
  Eventual,
  AwaitedEventual,
  EventualBase,
  isEventualOfKind,
  createEventual,
  Program,
} from "./eventual.js";
import { registerEventual } from "./global.js";
import { Result } from "./result.js";

export function isChain(a: any): a is Chain {
  return isEventualOfKind(EventualKind.Chain, a);
}

export interface Chain<T = any>
  extends Program<T>,
    EventualBase<EventualKind.Chain, Result<T>> {
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
  return createEventual(EventualKind.Chain, program);
}

export function registerChain(program: Program): Chain {
  return registerEventual(createChain(program));
}
