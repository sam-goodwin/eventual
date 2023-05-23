import type { estypes } from "@elastic/elasticsearch";
import type {
  DateFields,
  FieldsOfType,
  GeoFields,
  MappingNumericProperty,
  NumericFields,
  TermFields,
  TextFields,
} from "../fields.js";
import type { MappingObject } from "../query/search-query.js";

export type MetricsAggregation<Mapping extends MappingObject> =
  | AvgAggregation<Mapping>
  | BoxPlotAggregation<Mapping>
  | CardinalityAggregation<Mapping>
  | ExtendedStatsAggregation<Mapping>
  | GeoBoundsAggregation<Mapping>
  | GeoCentroidAggregation<Mapping>
  | GeoLineAggregation<Mapping>
  | CartesianBoundsAggregation<Mapping>
  | CartesianCentroidAggregation<Mapping>
  | MatrixStatsAggregation<Mapping>
  | MaxAggregation<Mapping>
  | MedianAbsoluteDeviationAggregation<Mapping>
  | MinAggregation<Mapping>
  | PercentileRanksAggregation<Mapping>
  | PercentilesAggregation<Mapping>
  | RateAggregation<Mapping>
  | ScriptedMetricAggregation
  | StatsAggregation<Mapping>
  | StringStatsAggregation<Mapping>
  | SumAggregation<Mapping>
  | TTestAggregation<Mapping>
  | TopHitsAggregation
  | TopMetricsAggregation
  | ValueCountAggregation<Mapping>
  | WeightedAvgAggregation<Mapping>;

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-avg-aggregation.html
 */
export interface AvgAggregation<Mapping extends MappingObject> {
  avg_grade: estypes.AggregationsAverageAggregation & {
    field: FieldsOfType<
      Mapping,
      MappingNumericProperty | estypes.MappingHistogramProperty
    >;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-boxplot-aggregation.html
 */
export interface BoxPlotAggregation<Mapping extends MappingObject> {
  box_plot: estypes.AggregationsBoxplotAggregation & {
    field: FieldsOfType<
      Mapping,
      MappingNumericProperty | estypes.MappingHistogramProperty
    >;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-cardinality-aggregation.html
 */
export interface CardinalityAggregation<Mapping extends MappingObject> {
  cardinality: estypes.AggregationsCardinalityAggregation & {
    field: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-extendedstats-aggregation.html
 */
export interface ExtendedStatsAggregation<Mapping extends MappingObject> {
  extended_stats: estypes.AggregationsExtendedStatsAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-geobounds-aggregation.html
 */
export interface GeoBoundsAggregation<Mapping extends MappingObject> {
  geo_bounds: estypes.AggregationsGeoBoundsAggregation & {
    field: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-geocentroid-aggregation.html
 */
export interface GeoCentroidAggregation<Mapping extends MappingObject> {
  geo_centroid: estypes.AggregationsGeoCentroidAggregation & {
    field: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-geo-line.html
 */
export interface GeoLineAggregation<Mapping extends MappingObject> {
  geo_line: estypes.AggregationsGeoLineAggregation & {
    point: {
      field: GeoFields<Mapping>;
    };
    sort: {
      field: DateFields<Mapping>;
    };
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-cartesian-bounds-aggregation.html
 */
export interface CartesianBoundsAggregation<Mapping extends MappingObject> {
  bounds: estypes.AggregationsGeoBoundsAggregation & {
    field: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-cartesian-centroid-aggregation.html
 */
export interface CartesianCentroidAggregation<Mapping extends MappingObject> {
  centroid: estypes.AggregationsGeoCentroidAggregation & {
    field: GeoFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-matrix-stats-aggregation.html
 */
export interface MatrixStatsAggregation<Mapping extends MappingObject> {
  matrix_stats: estypes.AggregationsMatrixStatsAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-max-aggregation.html
 */
export interface MaxAggregation<Mapping extends MappingObject> {
  max: estypes.AggregationsMaxAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-median-absolute-deviation-aggregation.html
 */
export interface MedianAbsoluteDeviationAggregation<
  Mapping extends MappingObject
> {
  median_absolute_deviation: estypes.AggregationsMedianAbsoluteDeviationAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-min-aggregation.html
 */
export interface MinAggregation<Mapping extends MappingObject> {
  min: estypes.AggregationsMinAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-percentile-rank-aggregation.html
 */
export interface PercentileRanksAggregation<Mapping extends MappingObject> {
  percentile_ranks: estypes.AggregationsPercentileRanksAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-percentile-aggregation.html
 */
export interface PercentilesAggregation<Mapping extends MappingObject> {
  percentiles: estypes.AggregationsPercentilesAggregation & {
    field: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-rate-aggregation.html
 */
export interface RateAggregation<Mapping extends MappingObject> {
  rate: estypes.AggregationsRateAggregation & {
    field?: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-scripted-metric-aggregation.html
 */
export interface ScriptedMetricAggregation {
  scripted_metric: estypes.AggregationsScriptedMetricAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-stats-aggregation.html
 */
export interface StatsAggregation<Mapping extends MappingObject> {
  stats: estypes.AggregationsStatsAggregation & {
    field?: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-string-stats-aggregation.html
 */
export interface StringStatsAggregation<Mapping extends MappingObject> {
  string_stats: estypes.AggregationsStringStatsAggregation & {
    field?: TextFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-sum-aggregation.html
 */
export interface SumAggregation<Mapping extends MappingObject> {
  sum: estypes.AggregationsSumAggregation & {
    field?: NumericFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-ttest-aggregation.html
 */
export interface TTestAggregation<Mapping extends MappingObject> {
  t_test: estypes.AggregationsTTestAggregation & {
    field?: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-top-hits-aggregation.html
 */
export interface TopHitsAggregation {
  top_hits: estypes.AggregationsTopHitsAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-top-metrics.html
 */
export interface TopMetricsAggregation {
  top_metrics: estypes.AggregationsTopMetricsAggregation;
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-valuecount-aggregation.html
 */
export interface ValueCountAggregation<Mapping extends MappingObject> {
  value_count: estypes.AggregationsValueCountAggregation & {
    field?: TermFields<Mapping>;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-weight-avg-aggregation.html
 */
export interface WeightedAvgAggregation<Mapping extends MappingObject> {
  weighted_avg: estypes.AggregationsWeightedAverageAggregation & {
    field?: NumericFields<Mapping>;
  };
}
