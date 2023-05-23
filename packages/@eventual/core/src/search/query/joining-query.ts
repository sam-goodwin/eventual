import type { estypes } from "@elastic/elasticsearch";
import type { FieldsOfType } from "../fields.js";
import type { MappingObject, SearchQuery } from "./search-query.js";

export type JoiningQuery<Mapping extends MappingObject> =
  | Nested<Mapping>
  | HasChild
  | HasParent
  | ParentId;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-nested-query.html
 */
export interface Nested<Mapping extends MappingObject> {
  nested: {
    path: FieldsOfType<Mapping, estypes.MappingNestedProperty>;
    query: SearchQuery<Mapping>;
  } & Omit<estypes.QueryDslNestedQuery, "path" | "query">;
}

export interface HasChild {
  // TODO: make type safe, joining is very complex, so leaving it out
  has_child: estypes.QueryDslHasChildQuery;
}

export interface HasParent {
  // TODO: make type safe, joining is very complex, so leaving it out
  has_parent: estypes.QueryDslHasParentQuery;
}

export interface ParentId {
  // TODO: make type safe, joining is very complex, so leaving it out
  parent_id: estypes.QueryDslParentIdQuery;
}
