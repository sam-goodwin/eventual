import type { estypes } from "@elastic/elasticsearch";
import type { opensearchtypes } from "@opensearch-project/opensearch";
import type { FieldValue } from "./fields.js";
import type { SearchIndexProperties } from "./search-index.js";
import type { SearchRequest } from "./query/search-query.js";

export type SearchResponse<
  Q extends SearchRequest<{
    properties: Properties;
  }>,
  Properties extends SearchIndexProperties,
  Document
> = estypes.SearchResponse<
  Document,
  AggregationResults<Q, Properties, Document>
> & {
  hits: {
    hits: { _source: Document }[];
  };
  aggregations: AggregationResults<Q, Properties, Document>;
};

type AggregationResults<
  Q extends SearchRequest<{
    properties: Properties;
  }>,
  Properties extends SearchIndexProperties,
  Document
> = Q["aggs"] extends undefined
  ? undefined
  : {
      [aggregationName in keyof Q["aggs"]]: AggregationResult<
        Q["aggs"][aggregationName],
        Document
      >;
    };

type AggregationResult<Agg, Document> = Agg extends {
  terms: opensearchtypes.AggregationsTermsAggregation;
}
  ? {
      doc_count_error_upper_bound?: number;
      sum_other_doc_count?: number;
      buckets: {
        key: FieldValue<Agg["terms"]["field"], Document>;
        doc_count: number;
      }[];
    }
  : opensearchtypes.AggregationsAggregate;
