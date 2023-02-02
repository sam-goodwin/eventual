import type z from "zod";

export type InferOrDefault<T, U> = T extends { [key: string]: z.ZodType }
  ? {
      [k in keyof T]: z.infer<T[k]>;
    }
  : T extends z.ZodType<infer Output>
  ? Output
  : U;
