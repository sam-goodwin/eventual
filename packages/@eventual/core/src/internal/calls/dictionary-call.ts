import type { DictionaryListRequest } from "../../dictionary.js";
import { getWorkflowHook } from "../eventual-hook.js";
import {
  createEventualCall,
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isDictionaryCall(a: any): a is DictionaryCall {
  return isEventualCallOfKind(EventualCallKind.DictionaryCall, a);
}

export interface DictionaryCall
  extends EventualCallBase<EventualCallKind.DictionaryCall> {
  operation: DictionaryOperation;
}

export function createDictionaryCall(operation: DictionaryOperation) {
  return getWorkflowHook().registerEventualCall(
    createEventualCall<DictionaryCall>(EventualCallKind.DictionaryCall, {
      operation,
    })
  );
}

export interface DictionaryOperationBase {
  name: string;
}

export type DictionaryOperation =
  | DictionaryGetDeleteOperation
  | DictionarySetOperation
  | DictionaryListOperation;

export interface DictionaryGetDeleteOperation extends DictionaryOperationBase {
  operation: "get" | "delete";
  key: string;
}

export interface DictionarySetOperation extends DictionaryOperationBase {
  operation: "set";
  key: string;
  value: any;
}

export interface DictionaryListOperation extends DictionaryOperationBase {
  operation: "list" | "listKeys";
  request: DictionaryListRequest;
}
