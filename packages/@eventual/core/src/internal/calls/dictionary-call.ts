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
  name: string;
  operation: DictionaryOperation;
}

export function createDictionaryCall(
  name: string,
  operation: DictionaryOperation
) {
  return getWorkflowHook().registerEventualCall(
    createEventualCall<DictionaryCall>(EventualCallKind.DictionaryCall, {
      name,
      operation,
    })
  );
}

export type DictionaryOperation =
  | DictionaryGetDeleteOperation
  | DictionarySetOperation
  | DictionaryListOperation;

export interface DictionaryGetDeleteOperation {
  operation: "get" | "delete";
  key: string;
}

export interface DictionarySetOperation {
  operation: "set";
  key: string;
  value: any;
}

export interface DictionaryListOperation {
  operation: "list" | "listKeys";
  request: DictionaryListRequest;
}
