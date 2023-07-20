import type { AttributesRuntime, Entity } from "./entity/entity.js";
import type { SearchIndex } from "./search/search-index.js";

export type Infer<Schema> = Schema extends SearchIndex<any, infer Document, any>
  ? Document
  : Schema extends Entity<any, infer Attributes, any>
  ? AttributesRuntime<Attributes>
  : never;
