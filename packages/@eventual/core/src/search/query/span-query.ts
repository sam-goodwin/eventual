import type { estypes } from "@elastic/elasticsearch";
import type { TextualFields } from "../fields.js";
import type { MappingObject } from "./search-query.js";
import type { TermLevelQuery } from "./term-level-query.js";

export type SpanQuery<Mapping extends MappingObject> =
  | SpanContaining<Mapping>
  | SpanFieldMasking<Mapping>
  | SpanFirst<Mapping>
  | SpanFirst<Mapping>
  | SpanMultiTerm<Mapping>
  | SpanNear<Mapping>
  | SpanNot<Mapping>
  | SpanOr<Mapping>
  | SpanTerm<Mapping>
  | SpanTerm<Mapping>
  | SpanWithin<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-containing-query.html
 */
export interface SpanContaining<Mapping extends MappingObject> {
  span_containing: {
    little?: SpanQuery<Mapping>;
    big?: SpanQuery<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-term-query.html
 */
export interface SpanTerm<Mapping extends MappingObject> {
  span_term: {
    [path in TextualFields<Mapping>]?: string | estypes.QueryDslSpanTermQuery;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-first-query.html
 */
export interface SpanFirst<Mapping extends MappingObject> {
  span_first: {
    match: SpanQuery<Mapping>;
    end?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-multi-term-query.html
 */
export interface SpanMultiTerm<Mapping extends MappingObject> {
  span_multi: {
    match: TermLevelQuery<Mapping>;
    end?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-field-masking-query.html
 */
export interface SpanFieldMasking<Mapping extends MappingObject> {
  span_field_masking: {
    field: TextualFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-near-query.html
 */
export interface SpanNear<Mapping extends MappingObject> {
  span_near: estypes.QueryDslSpanNearQuery & {
    clauses: SpanQuery<Mapping>[];
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-not-query.html
 */
export interface SpanNot<Mapping extends MappingObject> {
  span_not: estypes.QueryDslSpanNotQuery & {
    exclude: SpanQuery<Mapping>;
    include: SpanQuery<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-or-query.html
 */
export interface SpanOr<Mapping extends MappingObject> {
  span_or: estypes.QueryDslSpanOrQuery & {
    clauses: SpanQuery<Mapping>[];
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-span-within-query.html
 */
export interface SpanWithin<Mapping extends MappingObject> {
  span_within: estypes.QueryDslSpanWithinQuery & {
    big: SpanQuery<Mapping>;
    little: SpanQuery<Mapping>;
  };
}
