import type { z } from "zod";

export declare namespace HttpHeaders {
  export interface Schema {
    [headerName: string]: z.ZodType<undefined | string | string[]>;
  }

  export type IsOptional<Headers extends Schema | undefined = Schema> =
    Schema extends Headers
      ? true
      : Headers extends undefined
      ? true
      : { [header in keyof Headers]?: undefined } extends Headers
      ? true
      : false;

  export type ValueOfEnvelope<Headers extends Schema | undefined = Schema> =
    Schema extends Headers
      ? {
          headers?: {
            [headerName: string]: string | string[] | undefined;
          };
        }
      : Headers extends undefined
      ? {
          headers?: {
            [headerName: string]: string | string[] | undefined;
          };
        }
      : { [header in keyof Headers]?: undefined } extends Headers
      ? {
          headers?: {
            [headerName in keyof Headers]: z.infer<
              Exclude<Headers, undefined>[headerName]
            >;
          };
        }
      : {
          headers: {
            [headerName in keyof Headers]: z.infer<
              Exclude<Headers, undefined>[headerName]
            >;
          };
        };
  export type ValueOf<Headers extends Schema | undefined = Schema> =
    Schema extends Headers
      ? {
          [headerName: string]: string | string[] | undefined;
        }
      : Headers extends undefined
      ? {
          [headerName: string]: string | string[] | undefined;
        }
      : {
          [headerName in keyof Headers]: z.infer<
            Exclude<Headers, undefined>[headerName]
          >;
        };
}
