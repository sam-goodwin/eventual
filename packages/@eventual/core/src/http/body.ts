import type { Readable } from "node:stream";

export type RawBody = string | Buffer | Readable | null;
