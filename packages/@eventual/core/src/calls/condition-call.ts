import { ConditionPredicate } from "../condition.js";
import {
  EventualBase,
  EventualKind,
  EventualSymbol,
  isEventual,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Failed } from "../result.js";

export function isConditionCall(a: any): a is ConditionCall {
  return isEventual(a) && a[EventualSymbol] === EventualKind.ConditionCall;
}

export interface ConditionCall
  extends EventualBase<Resolved<boolean> | Failed> {
  [EventualSymbol]: EventualKind.ConditionCall;
  seq?: number;
  predicate: ConditionPredicate;
  timeoutSeconds?: number;
}

export function createConditionCall(
  predicate: ConditionPredicate,
  timeoutSeconds?: number
) {
  return registerEventual<ConditionCall>({
    [EventualSymbol]: EventualKind.ConditionCall,
    predicate,
    timeoutSeconds,
  });
}
