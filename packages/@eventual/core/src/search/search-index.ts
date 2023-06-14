// we're still using estypes for its better representation of mappings
// this means we may have a mismatch where our types support something
// the opensearch service does not
// but, opensearch's types are mostly covered by a generic type
// where-as elastic's types are specific to each mapping type
import type { estypes } from "@elastic/elasticsearch";
import type {
  Client,
  RequestParams,
  opensearchtypes,
} from "@opensearch-project/opensearch";
import {
  EventualCallKind,
  SearchCall,
  SearchCallRequest,
  SearchOperation,
  createEventualCall,
} from "../internal/calls.js";
import { getOpenSearchHook } from "../internal/search-hook.js";
import { assertApiResponseOK } from "./assert-api-response.js";
import type { MappingToDocument } from "./mapping.js";
import type { CountRequest, SearchRequest } from "./query/search-query.js";
import type { SearchResponse } from "./search-response.js";

import t from "type-fest";
import { registerEventualResource } from "../internal/global.js";

export type SearchIndexProperties = {
  [propertyName: string]: estypes.MappingProperty;
};

export type IndexRequest<Document> = Omit<
  RequestParams.Index<Document>,
  "index"
>;

export type UpdateRequest<Document> = Omit<
  RequestParams.Update<Document>,
  "index"
>;

// export interface SearchRequest<Properties extends SearchIndexProperties>
//   extends Omit<
//     RequestParams.Search<
//       Omit<estypes.SearchRequest, "query"> &
//         SearchQueryOrAggs<{
//           properties: Properties;
//         }>
//     >,
//     "index"
//   > {}

export type DeleteRequest = Omit<RequestParams.Delete, "index">;

export type BulkOperation<Document> =
  | {
      index: IndexRequest<Document>;
    }
  | {
      upsert: IndexRequest<Document>;
    }
  | {
      doc: Document;
    }
  | {
      delete: DeleteRequest;
    };

export interface BulkRequest<Document>
  extends Omit<RequestParams.Bulk<BulkOperation<Document>[]>, "body"> {
  operations: BulkOperation<Document>[];
}

export interface SearchIndex<
  Name extends string = string,
  Document = any,
  Properties extends SearchIndexProperties = SearchIndexProperties
> {
  kind: "SearchIndex";
  name: Name;
  /**
   * Name of the index stored in the cluster. It must be in snake case form
   */
  indexName: t.SnakeCase<Name>;
  options: SearchIndexOptions<Properties>;
  client: Client;
  index(
    request: IndexRequest<Document>
  ): Promise<opensearchtypes.IndexResponse>;
  delete(request: DeleteRequest): Promise<opensearchtypes.DeleteResponse>;
  update(
    request: UpdateRequest<Document>
  ): Promise<opensearchtypes.IndexResponse>;
  bulk(request: BulkRequest<Document>): Promise<opensearchtypes.BulkResponse>;
  count(
    request: CountRequest<{
      properties: Properties;
    }>
  ): Promise<opensearchtypes.CountResponse>;
  search<
    Q extends SearchRequest<{
      properties: Properties;
    }>
  >(
    request: Q,
    options?: Omit<opensearchtypes.SearchRequest, "table" | "body">
  ): Promise<SearchResponse<Q, Properties, Document>>;
}

export interface SearchIndexOptions<Properties extends SearchIndexProperties>
  extends Partial<opensearchtypes.IndicesIndexState> {
  mappings: opensearchtypes.MappingTypeMapping & {
    properties: Properties;
  };
  settings?: opensearchtypes.IndicesIndexSettings;
}

export function index<
  const Name extends string,
  const Properties extends SearchIndexProperties
>(
  name: Name,
  options: SearchIndexOptions<Properties>
): SearchIndex<
  Name,
  {
    [property in keyof Properties]: MappingToDocument<Properties[property]>;
  },
  Properties
> {
  type Document = {
    [property in keyof Properties]: MappingToDocument<Properties[property]>;
  };

  const indexName = toSnakeCase(name);

  const index: SearchIndex<Name, Document, Properties> = {
    kind: "SearchIndex",
    name,
    indexName,
    options,
    // defined as a getter below
    client: undefined as any,
    index: (request) => search("index", request),
    bulk: ({ operations, ...request }) =>
      search("bulk", {
        index: indexName,
        // @ts-ignore - quality of life mapping, users pass operations: [index, upsert, etc.] instead of body - this matches ES8+ and is more aesthetic
        body: operations,
        ...request,
      }),
    delete: (request) => search("delete", request),
    update: (request) => search("update", request),
    count: (request) => search("count", request as any),
    search: (request) => search("search", request as any),
  };
  Object.defineProperty(index, "client", {
    get: () => getOpenSearchHook().client.client satisfies Client,
  });
  return registerEventualResource("searchIndices", name, index as any);

  function search<Op extends SearchOperation, Response = any>(
    operation: Op,
    request: SearchCallRequest<Op>
  ): Promise<Response> {
    return getEventualCallHook().registerEventualCall(
      createEventualCall<SearchCall>(EventualCallKind.SearchCall, {
        operation,
        request,
      }),
      async (): Promise<Response> => {
        const response = await (index.client as any)[operation]({
          ...(operation === "index"
            ? request
            : {
                body: request,
              }),
          index: indexName,
        });
        assertApiResponseOK(response);
        return response.body as Response;
      }
    );
  }
}

// OpenSearch mandates that indexes are lowercase (fucking stupid)
function toSnakeCase<S extends string>(str: S) {
  return str
    .replace(/\W+/g, " ")
    .split(/ |\B(?=[A-Z])/)
    .map((word) => word.toLowerCase())
    .join("_") as t.SnakeCase<S>;
}
