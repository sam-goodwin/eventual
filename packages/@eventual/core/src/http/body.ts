import type { Readable } from "node:stream";
import type { z } from "zod";

export type RawBody = string | Buffer | Readable | null;

export type BodyEnvelope<Body extends z.ZodType | undefined> =
  Body extends undefined
    ? {
        body: RawBody;
      }
    : Body extends z.ZodUndefined
    ? {
        body?: undefined;
      }
    : {
        body: z.infer<Exclude<Body, undefined>>;
      };
