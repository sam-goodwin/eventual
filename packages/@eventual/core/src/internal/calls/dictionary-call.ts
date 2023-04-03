import type {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListRequest,
  DictionarySetOptions,
  DictionaryTransactItem,
} from "../../dictionary.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isDictionaryCall(a: any): a is DictionaryCall {
  return isEventualCallOfKind(EventualCallKind.DictionaryCall, a);
}

export type DictionaryCall<
  Op extends DictionaryOperation["operation"] = DictionaryOperation["operation"]
> = EventualCallBase<EventualCallKind.DictionaryCall> &
  DictionaryOperation & { operation: Op };

export function isDictionaryOperationOfType<
  OpType extends DictionaryOperation["operation"]
>(
  operation: OpType,
  call: DictionaryOperation
): call is DictionaryOperation & { operation: OpType } {
  return call.operation === operation;
}

export interface DictionaryOperationBase {
  name: string;
}

export type DictionaryOperation =
  | DictionaryDeleteOperation
  | DictionaryGetOperation
  | DictionaryGetWithMetadataOperation  
  | DictionaryListOperation
  | DictionaryListKeysOperation
  | DictionarySetOperation
  | DictionaryTransactOperation;

export interface DictionaryGetOperation extends DictionaryOperationBase {
  operation: "get";
  key: string | CompositeKey;
}

export interface DictionaryGetWithMetadataOperation
  extends DictionaryOperationBase {
  operation: "getWithMetadata";
  key: string | CompositeKey;
}

export interface DictionaryDeleteOperation extends DictionaryOperationBase {
  operation: "delete";
  key: string | CompositeKey;
  options?: DictionaryConsistencyOptions;
}

export interface DictionarySetOperation<Entity = any>
  extends DictionaryOperationBase {
  operation: "set";
  key: string | CompositeKey;
  value: Entity;
  options?: DictionarySetOptions;
}

export interface DictionaryListOperation extends DictionaryOperationBase {
  operation: "list";
  request: DictionaryListRequest;
}

export interface DictionaryListKeysOperation extends DictionaryOperationBase {
  operation: "listKeys";
  request: DictionaryListRequest;
}

export interface DictionaryTransactOperation {
  operation: "transact";
  items: DictionaryTransactItem<any>[];
}
