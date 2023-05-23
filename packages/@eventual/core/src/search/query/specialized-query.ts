import type { estypes } from "@elastic/elasticsearch";
import type { NumericFields, TextualFields } from "../fields.js";
import type { MappingObject, SearchQuery } from "./search-query.js";

export type SpecializedQuery<Mapping extends MappingObject> =
  | DistanceFeature
  | MoreLikeThis<Mapping>
  | Percolate
  | RankFeature<Mapping>
  | Script
  | ScriptScore<Mapping>
  | Wrapper
  | Pinned;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-distance-feature-query.html
 */
export interface DistanceFeature {
  distance_feature: estypes.QueryDslDistanceFeatureQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-mlt-query.html
 */
export interface MoreLikeThis<Mapping extends MappingObject> {
  more_like_this: estypes.QueryDslMoreLikeThisQuery & {
    fields: TextualFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-percolate-query.html
 */
export interface Percolate {
  percolate: estypes.QueryDslPercolateQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-rank-feature-query.html
 */
export interface RankFeature<Mapping extends MappingObject> {
  rank_feature: estypes.QueryDslRankFeatureQuery & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-script-query.html
 */
export interface Script {
  script: estypes.QueryDslScriptQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-script-score-query.html
 */
export interface ScriptScore<Mapping extends MappingObject> {
  script_score: estypes.QueryDslScriptScoreQuery & {
    query: SearchQuery<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-wrapper-query.html
 */
export interface Wrapper {
  wrapper: estypes.QueryDslWrapperQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-pinned-query.html
 */
export interface Pinned {
  pinned: estypes.QueryDslPinnedQuery;
}
