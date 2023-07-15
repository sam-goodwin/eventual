import type { Entity } from "./entity/entity.js";
import type { SearchIndex } from "./search/search-index.js";
import { SetOptionalFields } from "./type-utilts.js";

export type Infer<Schema> = Schema extends SearchIndex<any, infer Document, any>
  ? SetOptionalFields<Document>
  : Schema extends Entity<any, infer Attributes, any>
  ? SetOptionalFields<Attributes>
  : never;
