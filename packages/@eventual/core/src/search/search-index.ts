// we're still using estypes for its better representation of mappings
// this means we may have a mismatch where our types support something
// the opensearch service does not
// but, opensearch's types are mostly covered by a generic type
// where-as elastic's types are specific to each mapping type
import { estypes } from "@elastic/elasticsearch";
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
import { searchIndices } from "../internal/global.js";
import { getOpenSearchHook } from "../internal/search-hook.js";
import { SearchQueryOrAggs } from "./query/search-query.js";
import { MappingToDocument } from "./mapping.js";
import { assertApiResponseOK } from "./assert-api-response.js";

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
  search(
    request: SearchQueryOrAggs<{
      properties: Properties;
    }>,
    options?: Omit<opensearchtypes.SearchRequest, "table" | "body">
  ): Promise<opensearchtypes.SearchResponse<Document>>;
}

export interface SearchIndexOptions<Properties extends SearchIndexProperties>
  extends Omit<
    estypes.IndicesCreateRequest,
    "properties" | "settings" | "index"
  > {
  properties: Properties;
  settings?: estypes.IndicesIndexSettings;
}

export function searchIndex<
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
  if (searchIndices().has(name)) {
    throw new Error(`SearchIndex with name ${name} already defined`);
  }
  type Document = {
    [property in keyof Properties]: MappingToDocument<Properties[property]>;
  };

  const index: SearchIndex<Name, Document, Properties> = {
    kind: "SearchIndex",
    name,
    options,
    // defined as a getter below
    client: undefined as any,
    index: (request) => search("index", request),
    bulk: ({ operations, ...request }) =>
      search("bulk", {
        index: name,
        // @ts-ignore - quality of life mapping, users pass operations: [index, upsert, etc.] instead of body - this matches ES8+ and is more aesthetic
        body: operations,
        ...request,
      }),
    delete: (request) => search("delete", request),
    update: (request) => search("update", request),
    search: (request) => search("search", request as any),
  };
  Object.defineProperty(index, "client", {
    get: () => getOpenSearchHook().client,
  });
  searchIndices().set(name, index as any);
  return index;

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
          ...request,
          index: name,
        });
        assertApiResponseOK(response);
        return response.body as Response;
      }
    );
  }
}

const i = searchIndex("myIndex", {
  properties: {
    key: {
      type: "text",
    },
    obj: {
      type: "nested",
      properties: {
        location: {
          type: "geo_point",
        },
        a: {
          type: "text",
        },
      },
    },
  },
});

i.search({
  query: {
    term: {
      key: {
        value: "",
      },
    },
  },
});

i.client.search<estypes.SearchRequest>({
  body: {},
});
