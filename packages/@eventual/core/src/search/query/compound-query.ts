import type { estypes } from "@elastic/elasticsearch";
import { SearchQuery } from "./search-query.js";

export type CompoundQuery<Mapping extends estypes.MappingProperty> =
  | Bool<Mapping>
  | Boosting<Mapping>
  | ConstantScore<Mapping>
  | DisjunctionMax<Mapping>
  | FunctionScore<Mapping>;
/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html
 */
export interface Bool<Mapping extends estypes.MappingProperty> {
  bool: {
    filter?: SearchQuery<Mapping> | SearchQuery<Mapping>[];
    must?: SearchQuery<Mapping> | SearchQuery<Mapping>[];
    must_not?: SearchQuery<Mapping> | SearchQuery<Mapping>[];
    should?: SearchQuery<Mapping> | SearchQuery<Mapping>[];
    minimum_should_match?: estypes.MinimumShouldMatch;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-boosting-query.html
 */
export interface Boosting<Mapping extends estypes.MappingProperty> {
  boosting: {
    positive: SearchQuery<Mapping>;
    negative: SearchQuery<Mapping>;
    negative_boost?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-constant-score-query.html
 */
export interface ConstantScore<Mapping extends estypes.MappingProperty> {
  constant_score: {
    filter: SearchQuery<Mapping>;
    boost?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-dis-max-query.html
 */
export interface DisjunctionMax<Mapping extends estypes.MappingProperty> {
  dis_max: {
    queries: SearchQuery<Mapping>[];
    tie_breaker?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html
 */
export interface FunctionScore<Mapping extends estypes.MappingProperty> {
  function_score: {
    boost_mode?: estypes.QueryDslFunctionBoostMode;
    functions?: FunctionScoreFunction<Mapping>[];
    max_boost?: estypes.double;
    min_score?: estypes.double;
    query?: SearchQuery<Mapping>;
    score_mode?: estypes.QueryDslFunctionScoreMode;
  };
}

export interface FunctionScoreFunction<Mapping extends estypes.MappingProperty>
  extends Omit<estypes.QueryDslFunctionScoreContainer, "filter"> {
  filter?: SearchQuery<Mapping>;
}
