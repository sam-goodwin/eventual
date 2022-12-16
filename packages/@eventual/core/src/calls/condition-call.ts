import { ConditionPredicate } from "../condition.js";
import {
  CommandCallBase,
  createEventual,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Failed } from "../result.js";

export function isConditionCall(a: any): a is ConditionCall {
  return isEventualOfKind(EventualKind.ConditionCall, a);
}

export interface ConditionCall
  extends CommandCallBase<EventualKind.ConditionCall, Resolved<boolean> | Failed> {
  predicate: ConditionPredicate;
  timeoutSeconds?: number;
}

export function createConditionCall(
  predicate: ConditionPredicate,
  timeoutSeconds?: number
) {
  return registerEventual(
    createEventual<ConditionCall>(EventualKind.ConditionCall, {
      predicate,
      timeoutSeconds,
    })
  );
}
