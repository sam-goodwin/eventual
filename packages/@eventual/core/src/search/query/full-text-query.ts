import type { estypes } from "@elastic/elasticsearch";
import type { MappingObject } from "./search-query.js";

export type FullTextQuery<Mapping extends estypes.MappingProperty> =
  | CombinedFields<Mapping>
  | Intervals
  | Match<Mapping>
  | MatchAll
  | MatchBoolPrefix
  | MatchNone
  | MatchPhrase
  | MatchPhrasePrefix
  | MultiMatch<Mapping>
  | QueryString<Mapping>
  | SimpleQueryString<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-intervals-query.html
 */
export interface Intervals {
  intervals: estypes.QueryDslIntervalsQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query.html
 */
export interface Match<Mapping extends MappingObject> {
  match: {
    [field in keyof Mapping["properties"]]?: estypes.QueryDslMatchQuery;
  };
}

export interface MatchAll {
  match_all: {
    boost?: number;
  };
}

export interface MatchNone {
  match_none: Record<string, never>;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-bool-prefix-query.html
 */
export interface MatchBoolPrefix {
  match_bool_prefix: estypes.QueryDslMatchBoolPrefixQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query-phrase.html
 */
export interface MatchPhrase {
  match_phrase: estypes.QueryDslMatchPhraseQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query-phrase-prefix.html
 */
export interface MatchPhrasePrefix {
  match_phrase_prefix: estypes.QueryDslMatchPhrasePrefixQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-combined-fields-query.html
 */
export interface CombinedFields<Mapping extends MappingObject> {
  combined_fields: Omit<estypes.QueryDslCombinedFieldsQuery, "fields"> & {
    fields: (keyof Mapping["properties"])[];
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-multi-match-query.html
 */
export interface MultiMatch<Mapping extends MappingObject> {
  multi_match: {
    fields: FieldNameOrBoosted<Mapping>[];
  } & Omit<estypes.QueryDslMultiMatchQuery, "fields">;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html
 */
export interface QueryString<Mapping extends MappingObject> {
  query_string: {
    fields: FieldNameOrBoosted<Mapping>[];
  } & Omit<estypes.QueryDslQueryStringQuery, "fields">;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html
 */
export interface SimpleQueryString<Mapping extends MappingObject> {
  simple_query_string: {
    fields: FieldNameOrBoosted<Mapping>[];
  } & Omit<estypes.QueryDslSimpleQueryStringQuery, "fields">;
}

export type FieldNameOrBoosted<Mapping extends MappingObject> =
  | keyof Mapping["properties"]
  | `${Extract<keyof Mapping["properties"], string>}^${number}`;
