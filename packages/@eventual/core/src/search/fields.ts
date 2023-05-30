import type { estypes } from "@elastic/elasticsearch";

export type AllFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  estypes.MappingProperty
>;

export type TermFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  | estypes.MappingBooleanProperty
  | estypes.MappingDateProperty
  | estypes.MappingIpProperty
  | estypes.MappingKeywordProperty
  | estypes.MappingTextProperty
  | MappingNumericProperty
>;

export type TextualFields<Property extends estypes.MappingProperty> =
  FieldsOfType<
    Property,
    estypes.MappingTextProperty | estypes.MappingKeywordProperty
  >;

export type TextFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  estypes.MappingTextProperty
>;

export type KeywordFields<Property extends estypes.MappingProperty> =
  FieldsOfType<Property, estypes.MappingKeywordProperty>;

export type NumericFields<Property extends estypes.MappingProperty> =
  FieldsOfType<Property, MappingNumericProperty>;

export type MappingNumericProperty =
  | estypes.MappingFloatNumberProperty
  | estypes.MappingLongNumberProperty
  | estypes.MappingShortNumberProperty
  | estypes.MappingDoubleNumberProperty
  | estypes.MappingIntegerNumberProperty
  | estypes.MappingHalfFloatNumberProperty
  | estypes.MappingScaledFloatNumberProperty
  | estypes.MappingUnsignedLongNumberProperty;

export type DateFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  estypes.MappingDateProperty | estypes.MappingDateNanosProperty
>;

export type GeoFields<Mapping extends estypes.MappingProperty> = FieldsOfType<
  Mapping,
  estypes.MappingGeoPointProperty | estypes.MappingGeoShapeProperty
>;

export type IpFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  estypes.MappingIpProperty
>;

export type BoolFields<Property extends estypes.MappingProperty> = FieldsOfType<
  Property,
  estypes.MappingBooleanProperty
>;

export type BinaryFields<Property extends estypes.MappingProperty> =
  FieldsOfType<Property, estypes.MappingBinaryProperty>;

export type FieldsOfType<
  Property extends estypes.MappingProperty,
  PropertyType extends estypes.MappingProperty,
  Paths extends string = ""
> = Property extends PropertyType
  ? Property["fields"] extends Record<string, estypes.MappingProperty>
    ?
        | Paths
        | {
            [field in keyof Property["fields"]]: FieldsOfType<
              Property["fields"][field],
              PropertyType,
              `${Paths}.${Extract<field, string>}`
            >;
          }[keyof Property["fields"]]
    : Paths
  : Property extends
      | estypes.MappingNestedProperty
      | estypes.MappingObjectProperty
  ? {
      [prop in keyof Property["properties"]]: FieldsOfType<
        Exclude<Property["properties"], undefined>[prop],
        PropertyType,
        `${Paths extends "" ? "" : `${Paths}.`}${Extract<prop, string>}`
      >;
    }[keyof Property["properties"]]
  : never;

// resolve the value of a field in dot notation to its value type
// e.g. a.b.c in { a: { b: { c: string; }}} will return string.
export type FieldValue<
  FieldDotNotation extends string | undefined,
  Document
> = FieldDotNotation extends undefined
  ? any
  : Document extends string | number | boolean | undefined | null
  ? Document
  : FieldDotNotation extends `${infer field extends Extract<
      keyof Document,
      string
    >}.${infer rest}`
  ? FieldValue<rest, Document[field]>
  : FieldDotNotation extends keyof Document
  ? Document[FieldDotNotation]
  : never;
