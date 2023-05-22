// we're still using estypes for its better representation of mappings
// this means we may have a mismatch where our types support something
// the opensearch service does not
// but, opensearch's types are mostly covered by a generic type
// where-as elastic's types are specific to each mapping type
import type { estypes } from "@elastic/elasticsearch";
import type {
  ApiResponse,
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
} from "./internal/calls.js";
import { searchIndices } from "./internal/global.js";
import { getOpenSearchHook } from "./internal/search-hook.js";

export interface SearchIndexProperties {
  [propertyName: string]: estypes.MappingProperty;
}

export interface IndexRequest<Document>
  extends Omit<RequestParams.Index<Document>, "index"> {}

export interface UpdateRequest<Document>
  extends Omit<RequestParams.Update<Document>, "index"> {}

export interface DeleteRequest extends Omit<RequestParams.Delete, "index"> {}

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
    [property in keyof Properties]: MappingPropertyToJS<Properties[property]>;
  },
  Properties
> {
  if (searchIndices().has(name)) {
    throw new Error(`SearchIndex with name ${name} already defined`);
  }
  type Document = {
    [property in keyof Properties]: MappingPropertyToJS<Properties[property]>;
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
  };
  Object.defineProperty(index, "client", {
    get: () => getOpenSearchHook().client,
  });
  searchIndices().set(name, index);
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

export interface OpenSearchClient {
  client: Client;
}

export function assertApiResponseOK(response: ApiResponse) {
  if (
    response.statusCode !== 200 &&
    response.statusCode !== 201 &&
    response.statusCode !== 202
  ) {
    throw new Error(
      `Request failed with ${response.statusCode} and warnings ${response.warnings}`
    );
  }
}

type MappingPropertyToJS<Property extends estypes.MappingProperty> =
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/aggregate-metric-double.html
  Property extends estypes.MappingAggregateMetricDoubleProperty
    ? {
        [metric in Property["metrics"][number]]: number;
      }
    : Property extends estypes.MappingBinaryProperty
    ? Buffer
    : Property extends estypes.MappingBooleanProperty
    ? boolean
    : Property extends estypes.MappingByteNumberProperty
    ? estypes.byte
    : Property extends estypes.MappingCompletionProperty
    ? string
    : Property extends estypes.MappingConstantKeywordProperty
    ? Property["value"]
    : Property extends estypes.MappingDateNanosProperty
    ? estypes.DateTime
    : Property extends estypes.MappingDateProperty
    ? estypes.DateTime
    : Property extends estypes.MappingDateRangeProperty
    ? RangeProperty<estypes.DateTime>
    : Property extends estypes.MappingDenseVectorProperty
    ? DenseVector
    : Property extends estypes.MappingDoubleNumberProperty
    ? estypes.double
    : Property extends estypes.MappingDoubleRangeProperty
    ? RangeProperty<estypes.double>
    : Property extends estypes.MappingDynamicProperty
    ? any
    : Property extends estypes.MappingFieldAliasProperty
    ? never // TODO: this will need to be typed in queries
    : Property extends estypes.MappingFlattenedProperty
    ? MappingPropertiesToJS<Property["properties"]>
    : Property extends estypes.MappingFloatNumberProperty
    ? estypes.float
    : Property extends estypes.MappingFloatRangeProperty
    ? RangeProperty<estypes.float>
    : Property extends estypes.MappingGeoPointProperty
    ? GeoPointValue
    : Property extends estypes.MappingGeoShapeProperty
    ? GeoShapeValue
    : Property extends estypes.MappingHalfFloatNumberProperty
    ? estypes.float
    : Property extends estypes.MappingHistogramProperty
    ? Histogram
    : Property extends estypes.MappingIntegerNumberProperty
    ? number
    : Property extends estypes.MappingIntegerRangeProperty
    ? RangeProperty<number>
    : Property extends estypes.MappingIpProperty
    ? estypes.Ip
    : Property extends estypes.MappingIpRangeProperty
    ? RangeProperty<estypes.Ip>
    : Property extends estypes.MappingJoinProperty
    ? any
    : Property extends estypes.MappingKeywordProperty
    ? string
    : Property extends estypes.MappingLongNumberProperty
    ? estypes.long
    : Property extends estypes.MappingLongRangeProperty
    ? RangeProperty<estypes.long>
    : Property extends estypes.MappingMatchOnlyTextProperty
    ? string
    : Property extends estypes.MappingMurmur3HashProperty
    ? string // TODO: not sure what data type this is
    : Property extends estypes.MappingNestedProperty
    ? MappingPropertiesToJS<Property["properties"]>
    : Property extends estypes.MappingObjectProperty
    ? MappingPropertiesToJS<Property["properties"]>
    : Property extends estypes.MappingPercolatorProperty
    ? any // TODO: can this be well typed? https://www.elastic.co/guide/en/elasticsearch/reference/current/percolator.html
    : Property extends estypes.MappingPointProperty
    ? PointValue
    : // https://www.elastic.co/guide/en/elasticsearch/reference/current/rank-feature.html
    Property extends estypes.MappingRankFeatureProperty
    ? number
    : // https://www.elastic.co/guide/en/elasticsearch/reference/current/rank-features.html
    Property extends estypes.MappingRankFeaturesProperty
    ? {
        [feature: string]: number;
      }
    : Property extends estypes.MappingScaledFloatNumberProperty
    ? estypes.double
    : Property extends estypes.MappingSearchAsYouTypeProperty
    ? string
    : Property extends estypes.MappingShapeProperty
    ? GeoShapeValue
    : Property extends estypes.MappingShortNumberProperty
    ? number
    : Property extends estypes.MappingTextProperty
    ? string
    : Property extends estypes.MappingTokenCountProperty
    ? string
    : Property extends estypes.MappingUnsignedLongNumberProperty
    ? string
    : Property extends estypes.MappingVersionProperty
    ? string
    : Property extends estypes.MappingWildcardProperty
    ? string
    : any;

type RangeProperty<T> = {
  gte?: T;
  gt?: T;
  lt?: T;
  lte?: T;
};

type DenseVectorElement = number | BigInt;
type DenseVector = DenseVectorElement[];

interface MappingProperties {
  [propertyName: string]: estypes.MappingProperty;
}

type MappingPropertiesToJS<Properties extends MappingProperties | undefined> =
  Properties extends undefined
    ? any
    : {
        [property in keyof Properties]: MappingPropertyToJS<
          Exclude<Properties, undefined>[property]
        >;
      };

type PointTupleValue = [x: number, y: number];

type PointValue =
  | PointTupleValue
  | GeoJson.Point
  | {
      x: number;
      y: number;
    }
  | {
      // GeoJSON format
      type: "Point";
      coordinates: [x: number, y: number];
    }
  // WKT POINT
  | `POINT (${number} ${number})`
  | `${number},${number}`;

type GeoPointValue =
  | {
      lat: number;
      lon: number;
    }
  | PointValue
  // geohash
  | string;

declare namespace GeoJson {
  interface Point {
    // GeoJSON format
    type: "Point";
    coordinates: [x: number, y: number];
  }

  // https://geojson.org/geojson-spec.html#id3
  interface LineString {
    type: "LineString";
    coordinates: [PointTupleValue, PointTupleValue];
  }

  // https://geojson.org/geojson-spec.html#id4
  interface Polygon {
    type: "Polygon";
    coordinates: PointTupleValue[];
  }

  // https://geojson.org/geojson-spec.html#id5
  interface MultiPoint {
    type: "MultiPoint";
    coordinates: PointTupleValue[];
  }

  // https://geojson.org/geojson-spec.html#id7
  interface MultiLineString {
    type: "MultiLineString";
    coordinates: LineString["coordinates"][];
  }

  // https://geojson.org/geojson-spec.html#id7
  interface MultiPolygon {
    type: "MultiPolygon";
    coordinates: Polygon["coordinates"][];
  }

  interface GeometryCollection {
    type: "GeometryCollection";
    geometries: Exclude<GeoShapeValue, GeometryCollection>[];
  }
}

type GeoShapeValue =
  | GeoJson.GeometryCollection
  | GeoJson.LineString
  | GeoJson.MultiLineString
  | GeoJson.MultiPoint
  | GeoJson.MultiPolygon
  | GeoJson.Point
  | GeoJson.Polygon;

// https://www.elastic.co/guide/en/elasticsearch/reference/current/histogram.html
interface Histogram {
  values: number;
  counts: number;
}
