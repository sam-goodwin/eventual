import type {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListRequest,
  DictionarySetOptions,
} from "../../dictionary.js";
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
  | DictionaryDeleteOperation
  | DictionaryGetDeleteOperation
  | DictionarySetOperation
  | DictionaryListOperation;

export interface DictionaryGetDeleteOperation {
  operation: "get" | "getWithMetadata";
  key: string | CompositeKey;
}

export interface DictionaryDeleteOperation {
  operation: "delete";
  key: string | CompositeKey;
  options?: DictionaryConsistencyOptions;
}

export interface DictionarySetOperation<Entity = any> {
  operation: "set";
  key: string | CompositeKey;
  value: Entity;
  options?: DictionarySetOptions;
}

export interface DictionaryListOperation {
  operation: "list" | "listKeys";
  request: DictionaryListRequest;
}
