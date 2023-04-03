import { ConditionPredicate } from "../../condition.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind
} from "./calls.js";

export function isConditionCall(a: any): a is ConditionCall {
  return isEventualCallOfKind(EventualCallKind.ConditionCall, a);
}

export interface ConditionCall
  extends EventualCallBase<EventualCallKind.ConditionCall> {
  predicate: ConditionPredicate;
  timeout?: Promise<any>;
}