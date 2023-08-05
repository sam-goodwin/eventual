import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import type { EventualServiceClient } from "../service-client.js";
import type { ServiceSpec } from "./service-spec.js";

export enum EventualPropertyKind {
  BucketPhysicalName = 0,
  OpenSearchClient = 1,
  ServiceClient = 2,
  ServiceName = 3,
  ServiceSpec = 4,
  ServiceUrl = 5,
}

export const EventualPropertySymbol = /* @__PURE__ */ Symbol.for(
  "eventual:EventualProperty"
);

export type EventualProperty =
  | BucketPhysicalName
  | OpenSearchClientProperty
  | ServiceClientProperty
  | ServiceSpecProperty
  | ServiceUrlProperty
  | ServiceNameProperty;

export type EventualPropertyType<E extends EventualProperty> =
  E extends EventualPropertyBase<any, infer Type> ? Type : never;

export interface EventualPropertyBase<Kind extends EventualPropertyKind, Type> {
  [EventualPropertySymbol]: Kind;
  __type: Type;
}

export function createEventualProperty<P extends EventualProperty>(
  kind: P[typeof EventualPropertySymbol],
  e: Omit<P, typeof EventualPropertySymbol | "__type">
): P {
  (e as P)[EventualPropertySymbol] = kind;
  return e as P;
}

export function isServicePropertyOfKind<K extends EventualPropertyKind>(
  kind: K,
  property: EventualProperty
): property is EventualProperty & { [EventualPropertySymbol]: K } {
  return property[EventualPropertySymbol] === kind;
}

export interface BucketPhysicalName
  extends EventualPropertyBase<
    EventualPropertyKind.BucketPhysicalName,
    string
  > {
  bucketName: string;
}

export type OpenSearchClientProperty = EventualPropertyBase<
  EventualPropertyKind.OpenSearchClient,
  OpenSearchClient
>;

export type ServiceClientProperty = EventualPropertyBase<
  EventualPropertyKind.ServiceClient,
  EventualServiceClient
>;

export type ServiceUrlProperty = EventualPropertyBase<
  EventualPropertyKind.ServiceUrl,
  string
>;

export type ServiceNameProperty = EventualPropertyBase<
  EventualPropertyKind.ServiceName,
  string
>;

export type ServiceSpecProperty = EventualPropertyBase<
  EventualPropertyKind.ServiceSpec,
  ServiceSpec
>;
