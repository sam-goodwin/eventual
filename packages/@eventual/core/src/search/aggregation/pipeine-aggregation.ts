import type { estypes } from "@elastic/elasticsearch";

// TODO: update to be type-safe (aware of the buckets it can aggregat on)
export type PipelineAggregation = Pick<
  estypes.AggregationsAggregationContainer,
  | "avg_bucket"
  | "bucket_script"
  | "bucket_count_ks_test"
  | "bucket_correlation"
  | "bucket_selector"
  | "bucket_sort"
  | "cumulative_cardinality"
  | "cumulative_sum"
  | "derivative"
  | "extended_stats_bucket"
  | "inference"
  | "max_bucket"
  | "min_bucket"
  | "moving_fn"
  | "moving_percentiles"
  | "normalize"
  | "percentiles_bucket"
  | "serial_diff"
  | "stats_bucket"
  | "sum_bucket"
>;
