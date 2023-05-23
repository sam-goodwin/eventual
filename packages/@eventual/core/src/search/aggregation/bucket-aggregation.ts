import type { estypes } from "@elastic/elasticsearch";
import type {
  AllFields,
  DateFields,
  GeoFields,
  IpFields,
  NumericFields,
  TermFields,
  TextFields,
  TextualFields,
} from "../fields.js";
import type { MappingObject, SearchQuery } from "../query/search-query.js";

export type BucketAggregation<Mapping extends MappingObject> =
  | AdjacencyMatrix<Mapping>
  | AutoDateHistogram<Mapping>
  | CategorizeText<Mapping>
  | Children
  | Composite<Mapping>
  | DateHistogramAggregation<Mapping>
  | DiversifiedSamplerAggregation<Mapping>
  | FiltersAggregation
  | GeoHashGridAggregation<Mapping>
  | GeoHexGridAggregation<Mapping>
  | GeoTileGridAggregation<Mapping>
  | GlobalAggregation
  | HistogramAggregation<Mapping>
  | IpPrefixAggregation<Mapping>
  | IpRangeAggregation<Mapping>
  | MissingAggregation<Mapping>
  | MultiTermsAggregation<Mapping>
  | NestedAggregation<Mapping>
  | ParentAggregation
  | RangeAggregation<Mapping>
  | RareTermsAggregation<Mapping>
  | ReverseNestedAggregation
  | SamplerAggregation
  | SignificantTermsAggregation<Mapping>
  | SignificantTextAggregation<Mapping>
  | TermsAggregation<Mapping>
  | VariableWidthAggregation<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-adjacency-matrix-aggregation.html
 */
export interface AdjacencyMatrix<Mapping extends MappingObject> {
  adjacency_matrix: estypes.AggregationsAdjacencyMatrixAggregation & {
    filters: Record<string, SearchQuery<Mapping>>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-autodatehistogram-aggregation.html
 */
export interface AutoDateHistogram<Mapping extends MappingObject> {
  auto_date_histogram: estypes.AggregationsAutoDateHistogramAggregation & {
    field?: DateFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-categorize-text-aggregation.html
 */
export interface CategorizeText<Mapping extends MappingObject> {
  categorize_text: estypes.AggregationsCategorizeTextAggregation & {
    field: TextualFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-children-aggregation.html
 */
export interface Children {
  categorize_text: estypes.AggregationsChildrenAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-composite-aggregation.html
 */
export interface Composite<Mapping extends MappingObject> {
  categorize_text: estypes.AggregationsCompositeAggregation & {
    sources: {
      [field in AllFields<Mapping>]: CompositeFieldAggregation<Mapping>;
    }[];
  };
}

export type CompositeFieldAggregation<Mapping extends MappingObject> =
  | HistogramAggregation<Mapping>
  | DateHistogramAggregation<Mapping>
  | GeoTileGridAggregation<Mapping>
  | TermsAggregation<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-datehistogram-aggregation.html
 */
export interface DateHistogramAggregation<Mapping extends MappingObject> {
  date_histogram: estypes.AggregationsDateHistogramAggregation & {
    field?: DateFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-daterange-aggregation.html
 */
export interface DateRangeAggregation<Mapping extends MappingObject> {
  date_range: estypes.AggregationsDateRangeAggregation & {
    field?: DateFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-diversified-sampler-aggregation.html
 */
export interface DiversifiedSamplerAggregation<Mapping extends MappingObject> {
  diversified_sampler: estypes.AggregationsDiversifiedSamplerAggregation & {
    field?: DateFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-filters-aggregation.html
 */
export interface FiltersAggregation {
  filters: estypes.AggregationsFiltersAggregate;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-geodistance-aggregation.html
 */
export interface GeoDistanceAggregation<Mapping extends MappingObject> {
  geo_distance: estypes.AggregationsGeoDistanceAggregation & {
    field?: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-geohashgrid-aggregation.html
 */
export interface GeoHashGridAggregation<Mapping extends MappingObject> {
  geohash_grid: estypes.AggregationsGeoHashGridAggregation & {
    field?: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-geohexgrid-aggregation.html
 */
export interface GeoHexGridAggregation<Mapping extends MappingObject> {
  geohex_grid: estypes.AggregationsGeohexGridAggregation & {
    field?: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-geotilegrid-aggregation.html
 */
export interface GeoTileGridAggregation<Mapping extends MappingObject> {
  geotile_grid: estypes.AggregationsGeoTileGridAggregation & {
    field?: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-global-aggregation.html
 */
export interface GlobalAggregation {
  global: estypes.AggregationsGlobalAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-histogram-aggregation.html
 */
export interface HistogramAggregation<Mapping extends MappingObject> {
  histogram: estypes.AggregationsHistogramAggregation & {
    field?: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-ipprefix-aggregation.html
 */
export interface IpPrefixAggregation<Mapping extends MappingObject> {
  ip_prefix: estypes.AggregationsIpPrefixAggregation & {
    field?: IpFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-iprange-aggregation.html
 */
export interface IpRangeAggregation<Mapping extends MappingObject> {
  ip_range: estypes.AggregationsIpRangeAggregation & {
    field?: IpFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-missing-aggregation.html
 */
export interface MissingAggregation<Mapping extends MappingObject> {
  missing: estypes.AggregationsMissingAggregation & {
    field?: AllFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-multi-terms-aggregation.html
 */
export interface MultiTermsAggregation<Mapping extends MappingObject> {
  missing: estypes.AggregationsMultiTermsAggregation & {
    terms?: (estypes.AggregationsMultiTermLookup & {
      field: AllFields<Mapping>;
    })[];
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-nested-aggregation.html
 */
export interface NestedAggregation<Mapping extends MappingObject> {
  nested: estypes.AggregationsNestedAggregation & {
    path: AllFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-parent-aggregation.html
 */
export interface ParentAggregation {
  parent: estypes.AggregationsParentAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-range-aggregation.html
 */
export interface RangeAggregation<Mapping extends MappingObject> {
  range: estypes.AggregationsRangeAggregation & {
    field: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-rare-terms-aggregation.html
 */
export interface RareTermsAggregation<Mapping extends MappingObject> {
  rare_terms: estypes.AggregationsRareTermsAggregation & {
    field: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-reverse-nested-aggregation.html
 */
export interface ReverseNestedAggregation {
  reverse_nested: estypes.AggregationsReverseNestedAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-sampler-aggregation.html
 */
export interface SamplerAggregation {
  reverse_nested: estypes.AggregationsSamplerAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-significantterms-aggregation.html
 */
export interface SignificantTermsAggregation<Mapping extends MappingObject> {
  significant_terms: estypes.AggregationsSignificantTermsAggregation & {
    field?: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-significanttext-aggregation.html
 */
export interface SignificantTextAggregation<Mapping extends MappingObject> {
  significant_text: estypes.AggregationsSignificantTextAggregation & {
    field?: TextFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-terms-aggregation.html
 */
export interface TermsAggregation<Mapping extends MappingObject> {
  terms: estypes.AggregationsTermsAggregation & {
    // The field can be Keyword, Numeric, ip, boolean, or binary.
    field?: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-variablewidthhistogram-aggregation.html
 */
export interface VariableWidthAggregation<Mapping extends MappingObject> {
  significant_text: estypes.AggregationsVariableWidthHistogramAggregation & {
    field?: TermFields<Mapping>;
  };
}
