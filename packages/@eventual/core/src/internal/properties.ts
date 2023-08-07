import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import type { EventualServiceClient } from "../service-client.js";
import type { ServiceSpec } from "./service-spec.js";

export enum PropertyKind {
  BucketPhysicalName = 0,
  OpenSearchClient = 1,
  ServiceClient = 2,
  ServiceName = 3,
  ServiceSpec = 4,
  ServiceUrl = 5,
}

export const PropertySymbol = /* @__PURE__ */ Symbol.for(
  "eventual:EventualProperty"
);

export type Property =
  | BucketPhysicalName
  | OpenSearchClientProperty
  | ServiceClientProperty
  | ServiceSpecProperty
  | ServiceUrlProperty
  | ServiceNameProperty;

export type PropertyType<E extends Property> = E extends PropertyBase<
  any,
  infer Type
>
  ? Type
  : never;

export interface PropertyBase<Kind extends PropertyKind, Type> {
  [PropertySymbol]: Kind;
  __type: Type;
}

export function createEventualProperty<P extends Property>(
  kind: P[typeof PropertySymbol],
  e: Omit<P, typeof PropertySymbol | "__type">
): P {
  (e as P)[PropertySymbol] = kind;
  return e as P;
}

export function isServicePropertyOfKind<K extends PropertyKind>(
  kind: K,
  property: Property
): property is Property & { [PropertySymbol]: K } {
  return property[PropertySymbol] === kind;
}

export interface BucketPhysicalName
  extends PropertyBase<PropertyKind.BucketPhysicalName, string> {
  bucketName: string;
}

export type OpenSearchClientProperty = PropertyBase<
  PropertyKind.OpenSearchClient,
  OpenSearchClient
>;

export type ServiceClientProperty = PropertyBase<
  PropertyKind.ServiceClient,
  EventualServiceClient
>;

export type ServiceUrlProperty = PropertyBase<PropertyKind.ServiceUrl, string>;

export type ServiceNameProperty = PropertyBase<
  PropertyKind.ServiceName,
  string
>;

export type ServiceSpecProperty = PropertyBase<
  PropertyKind.ServiceSpec,
  ServiceSpec
>;
