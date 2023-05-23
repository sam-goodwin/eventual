import type { estypes } from "@elastic/elasticsearch";
import type { SpanQuery } from "./span-query.js";
import type { TermLevelQuery } from "./term-level-query.js";
import type { FullTextQuery } from "./full-text-query.js";
import type { GeoQuery } from "./geo-query.js";
import { ShapeQuery } from "./shape-query.js";
import { JoiningQuery } from "./joining-query.js";
import { SpecializedQuery } from "./specialized-query.js";
import { BucketAggregation } from "../aggregation/bucket-aggregation.js";
import { MetricsAggregation } from "../aggregation/metrics-aggregation.js";
import { PipelineAggregation } from "../aggregation/pipeine-aggregation.js";

export type MappingObject = estypes.MappingProperty & {
  properties?: Record<string, estypes.MappingProperty>;
};

export interface SearchQueryOrAggs<Mapping extends estypes.MappingProperty> {
  query?: SearchQuery<Mapping>;
  aggs?: {
    [aggregationName: string]: SearchAggregation<Mapping>;
  };
}

export type SearchQuery<Mapping extends estypes.MappingProperty> =
  | FullTextQuery<Mapping>
  | GeoQuery<Mapping>
  | JoiningQuery<Mapping>
  | ShapeQuery<Mapping>
  | SpanQuery<Mapping>
  | SpanQuery<Mapping>
  | SpecializedQuery<Mapping>
  | TermLevelQuery<Mapping>;

export type SearchAggregation<Mapping extends estypes.MappingProperty> =
  | ({
      filter?: SearchQuery<Mapping>[];
      aggs?: {
        [aggregationName: string]: SearchAggregation<Mapping>;
      };
    } & BucketAggregation<Mapping>)
  | MetricsAggregation<Mapping>
  | PipelineAggregation;
