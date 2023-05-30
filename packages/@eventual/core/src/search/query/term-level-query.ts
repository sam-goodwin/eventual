import type { estypes } from "@elastic/elasticsearch";
import type {
  AllFields,
  TextualFields,
  NumericFields,
  DateFields,
  KeywordFields,
} from "../fields.js";

export type TermLevelQuery<Mapping extends estypes.MappingProperty> =
  | Exists<Mapping>
  | Fuzzy<Mapping>
  | IDs
  | RegExp<Mapping>
  | Prefix<Mapping>
  | Range<Mapping>
  | Term<Mapping>
  | Terms<Mapping>
  | TermsSet<Mapping>
  | Wildcard<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-exists-query.html
 */
export interface Exists<Mapping extends estypes.MappingProperty> {
  exists: {
    field: AllFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-fuzzy-query.html
 */
export interface Fuzzy<Mapping extends estypes.MappingProperty> {
  fuzzy: {
    [field in TextualFields<Mapping>]: estypes.QueryDslFuzzyQuery;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-ids-query.html
 */
export interface IDs {
  ids: estypes.QueryDslIdsQuery;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-prefix-query.html
 */
export interface Prefix<Mapping extends estypes.MappingProperty> {
  prefix: {
    [field in TextualFields<Mapping>]: estypes.QueryDslPrefixQuery;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-range-query.html
 */
export interface Range<Mapping extends estypes.MappingProperty> {
  range: {
    [field in NumericFields<Mapping>]?: estypes.QueryDslNumberRangeQuery;
  } & {
    [field in DateFields<Mapping>]?: estypes.QueryDslDateRangeQuery;
  } & {
    // not sure why types don't allow strings, but docs say it does
    [field in TextualFields<Mapping>]?: {
      gt?: string;
      gte?: string;
      lt?: string;
      lte?: string;
      from?: string | null;
      to?: string | null;
    };
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-regexp-query.html
 */
export interface RegExp<Mapping extends estypes.MappingProperty> {
  regexp: {
    [field in TextualFields<Mapping>]?: estypes.QueryDslRegexpQuery;
  };
}

export interface Term<Mapping extends estypes.MappingProperty> {
  term: {
    [field in KeywordFields<Mapping>]?: estypes.QueryDslTermQuery;
  };
}

export interface Terms<Mapping extends estypes.MappingProperty> {
  terms: {
    [field in KeywordFields<Mapping>]?: estypes.QueryDslTermQuery;
  } & estypes.QueryDslTermsQueryKeys;
}

export interface TermsSet<Mapping extends estypes.MappingProperty> {
  terms_set: {
    [field in KeywordFields<Mapping>]?: estypes.QueryDslTermsSetQuery;
  };
}

export interface Wildcard<Mapping extends estypes.MappingProperty> {
  wildcard: {
    [field in TextualFields<Mapping>]?: estypes.QueryDslWildcardQuery;
  };
}
