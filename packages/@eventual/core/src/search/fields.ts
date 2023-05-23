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
  ? Paths
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
