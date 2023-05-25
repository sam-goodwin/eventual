import type { estypes } from "@elastic/elasticsearch";
import { Query } from "./search-query.js";

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
    filter?: Query<Mapping> | Query<Mapping>[];
    must?: Query<Mapping> | Query<Mapping>[];
    must_not?: Query<Mapping> | Query<Mapping>[];
    should?: Query<Mapping> | Query<Mapping>[];
    minimum_should_match?: estypes.MinimumShouldMatch;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-boosting-query.html
 */
export interface Boosting<Mapping extends estypes.MappingProperty> {
  boosting: {
    positive: Query<Mapping>;
    negative: Query<Mapping>;
    negative_boost?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-constant-score-query.html
 */
export interface ConstantScore<Mapping extends estypes.MappingProperty> {
  constant_score: {
    filter: Query<Mapping>;
    boost?: number;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-dis-max-query.html
 */
export interface DisjunctionMax<Mapping extends estypes.MappingProperty> {
  dis_max: {
    queries: Query<Mapping>[];
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
    query?: Query<Mapping>;
    score_mode?: estypes.QueryDslFunctionScoreMode;
  };
}

export interface FunctionScoreFunction<Mapping extends estypes.MappingProperty>
  extends Omit<estypes.QueryDslFunctionScoreContainer, "filter"> {
  filter?: Query<Mapping>;
}
