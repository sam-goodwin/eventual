import type { Entity } from "./entity/entity.js";
import type { SearchIndex } from "./search/search-index.js";
import fest from "type-fest";

export type Infer<Schema> = Schema extends SearchIndex<any, infer Document, any>
  ? SetOptionalFields<Document>
  : Schema extends Entity<any, infer Attributes, any>
  ? SetOptionalFields<Attributes>
  : never;

// the .optional() properties do not maintain the ? optional modifier
// TODO: debug
type SetOptionalFields<T> = fest.SetOptional<
  T,
  {
    [k in keyof T]: undefined extends T[k] ? k : never;
  }[keyof T]
>;
