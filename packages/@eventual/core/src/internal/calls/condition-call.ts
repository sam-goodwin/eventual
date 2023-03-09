import { ConditionPredicate } from "../../condition.js";
import { getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isConditionCall(a: any): a is ConditionCall {
  return isEventualCallOfKind(EventualCallKind.ConditionCall, a);
}

export interface ConditionCall
  extends EventualCallBase<EventualCallKind.ConditionCall> {
  predicate: ConditionPredicate;
  timeout?: Promise<any>;
}

export function createConditionCall(
  predicate: ConditionPredicate,
  timeout?: Promise<any>
) {
  return getWorkflowHook().registerEventualCall(
    createEventualCall<ConditionCall>(EventualCallKind.ConditionCall, {
      predicate,
      timeout,
    })
  );
}
