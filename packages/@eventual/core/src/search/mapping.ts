import { estypes } from "@elastic/elasticsearch";

export type MappingToDocument<Property extends estypes.MappingProperty> =
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

type DenseVectorElement = number | bigint;
type DenseVector = DenseVectorElement[];

interface MappingProperties {
  [propertyName: string]: estypes.MappingProperty;
}

type MappingPropertiesToJS<Properties extends MappingProperties | undefined> =
  Properties extends undefined
    ? any
    : {
        [property in keyof Properties]: MappingToDocument<
          Exclude<Properties, undefined>[property]
        >;
      };

type PointTupleValue = [x: number, y: number];

export type PointValue =
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

export type GeoPointValue =
  | {
      lat: number;
      lon: number;
    }
  | PointValue
  // geohash
  | string;

// eslint-disable-next-line @typescript-eslint/no-namespace
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

export type GeoShapeValue =
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
