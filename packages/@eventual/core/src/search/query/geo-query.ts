import type { estypes } from "@elastic/elasticsearch";
import type { MappingObject } from "./search-query.js";
import type { GeoFields } from "../fields.js";
import { GeoPointValue } from "../mapping.js";

export type GeoQuery<Mapping extends estypes.MappingProperty> =
  | GeoBoundingBox<Mapping>
  | GeoDistance<Mapping>
  | GeoHashGrid<Mapping>
  | GeoHexGrid<Mapping>
  | GeoShape<Mapping>
  | GeoPolygon<Mapping>;

export interface GeoBoundingBox<Mapping extends estypes.MappingProperty> {
  geo_bounding_box: {
    [path in keyof GeoFields<Mapping>]:
      | estypes.GeoBounds
      | estypes.QueryDslGeoExecution
      | estypes.QueryDslGeoValidationMethod
      | boolean
      | estypes.float
      | string;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-geo-distance-query.html
 */
export interface GeoDistance<Mapping extends MappingObject> {
  geo_distance: {
    distance: string;
    distance_type?: "arc" | "plane";
  } & {
    [k in GeoFields<Mapping>]: GeoPointValue;
  };
}

/**
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-geo-shape-query.html
 */
export interface GeoShape<Mapping extends MappingObject> {
  geo_shape: {
    [k in GeoFields<Mapping>]: estypes.QueryDslGeoShapeFieldQuery;
  };
}

export interface GeoHashGrid<Mapping extends MappingObject> {
  geohash_grid: {
    field: GeoFields<Mapping>;
  };
}

export interface GeoHexGrid<Mapping extends MappingObject> {
  geohex_grid: {
    field: GeoFields<Mapping>;
    precision: number;
  };
}

export interface GeoPolygon<Mapping extends MappingObject> {
  geo_polygon: {
    [field in GeoFields<Mapping>]?:
      | estypes.QueryDslGeoPolygonPoints
      | estypes.QueryDslGeoValidationMethod
      | boolean
      | estypes.float
      | string;
  } & estypes.QueryDslGeoPolygonQueryKeys;
}
