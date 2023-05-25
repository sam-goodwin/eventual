import type { Entity } from "./entity/entity.js";
import type { SearchIndex } from "./search/search-index.js";

/* eslint-disable @typescript-eslint/no-namespace */
export declare namespace e {
  export type infer<Schema> = Schema extends SearchIndex<
    any,
    infer Document,
    any
  >
    ? Document
    : Schema extends Entity<infer Attributes, any, any>
    ? Attributes
    : never;
}
