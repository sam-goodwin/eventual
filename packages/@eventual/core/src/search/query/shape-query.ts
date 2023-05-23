import type { estypes } from "@elastic/elasticsearch";
import type { FieldsOfType } from "../fields.js";
import type { MappingObject } from "./search-query.js";
import type { GeoShapeValue } from "../mapping.js";

export type ShapeQuery<Mapping extends MappingObject> = Shape<Mapping>;

export interface Shape<Mapping extends MappingObject> {
  shape: {
    [field in FieldsOfType<Mapping, estypes.MappingShapeProperty>]?:
      | ShapeField
      | boolean
      | estypes.float
      | string;
  };
}

interface ShapeField {
  indexed_shape?: estypes.QueryDslFieldLookup;
  relation?: estypes.GeoShapeRelation;
  shape?: GeoShapeValue;
}
