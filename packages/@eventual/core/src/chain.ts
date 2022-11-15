import { isEventual, EventualSymbol, EventualKind, Eventual } from "./eventual";
import { registerActivity } from "./global";
import { Program } from "./interpret";
import { Result } from "./result";

export function isChain(a: any): a is Chain {
  return isEventual(a) && a[EventualSymbol] === EventualKind.Chain;
}

export interface Chain<T = any> extends Program<T> {
  [EventualSymbol]: EventualKind.Chain;
  result?: Result<T>;
  awaiting?: Eventual;
}

export function createChain(program: Program): Chain {
  (program as any)[EventualSymbol] = EventualKind.Chain;
  return program as Chain;
}

export function registerChain(program: Program): Chain {
  return registerActivity(createChain(program));
}
