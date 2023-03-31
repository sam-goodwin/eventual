import type {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListRequest,
  DictionarySetOptions,
} from "../../dictionary.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isDictionaryCall(a: any): a is DictionaryCall {
  return isEventualCallOfKind(EventualCallKind.DictionaryCall, a);
}

export interface DictionaryCall<
  Operation extends DictionaryOperation = DictionaryOperation
> extends EventualCallBase<EventualCallKind.DictionaryCall> {
  name: string;
  operation: Operation;
}

export function isDictionaryCallOfType<
  OpType extends DictionaryOperation["operation"]
>(
  operation: OpType,
  call: DictionaryCall
): call is DictionaryCall<DictionaryOperation & { operation: OpType }> {
  return call.operation.operation === operation;
}

export type DictionaryOperation =
  | DictionaryDeleteOperation
  | DictionaryGetOperation
  | DictionarySetOperation
  | DictionaryListOperation;

export interface DictionaryGetOperation {
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
