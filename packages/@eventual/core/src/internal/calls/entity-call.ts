import type {
  CompositeKey,
  EntityConsistencyOptions,
  EntityListRequest,
  EntitySetOptions,
  EntityTransactItem,
} from "../../entity.js";
import {
  EventualCallBase,
  EventualCallKind,
  isEventualCallOfKind,
} from "./calls.js";

export function isEntityCall(a: any): a is EntityCall {
  return isEventualCallOfKind(EventualCallKind.EntityCall, a);
}

export type EntityCall<
  Op extends EntityOperation["operation"] = EntityOperation["operation"]
> = EventualCallBase<EventualCallKind.EntityCall> &
  EntityOperation & { operation: Op };

export function isEntityOperationOfType<
  OpType extends EntityOperation["operation"]
>(
  operation: OpType,
  call: EntityOperation
): call is EntityOperation & { operation: OpType } {
  return call.operation === operation;
}

export interface EntityOperationBase {
  name: string;
}

export type EntityOperation =
  | EntityDeleteOperation
  | EntityGetOperation
  | EntityGetWithMetadataOperation
  | EntityListOperation
  | EntityListKeysOperation
  | EntitySetOperation
  | EntityTransactOperation;

export interface EntityGetOperation extends EntityOperationBase {
  operation: "get";
  key: string | CompositeKey;
}

export interface EntityGetWithMetadataOperation extends EntityOperationBase {
  operation: "getWithMetadata";
  key: string | CompositeKey;
}

export interface EntityDeleteOperation extends EntityOperationBase {
  operation: "delete";
  key: string | CompositeKey;
  options?: EntityConsistencyOptions;
}

export interface EntitySetOperation<Entity = any> extends EntityOperationBase {
  operation: "set";
  key: string | CompositeKey;
  value: Entity;
  options?: EntitySetOptions;
}

export interface EntityListOperation extends EntityOperationBase {
  operation: "list";
  request: EntityListRequest;
}

export interface EntityListKeysOperation extends EntityOperationBase {
  operation: "listKeys";
  request: EntityListRequest;
}

export interface EntityTransactOperation {
  operation: "transact";
  items: EntityTransactItem<any>[];
}
