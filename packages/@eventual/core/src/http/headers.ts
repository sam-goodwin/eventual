import type { z } from "zod";

export interface HttpHeaders {
  [headerName: string]: string | string[] | undefined;
}

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

  export type Envelope<Headers extends Schema | undefined = Schema> =
    Schema extends Headers
      ? {
          headers?: HttpHeaders;
        }
      : Headers extends undefined
      ? {
          headers?: HttpHeaders;
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
  export type FromSchema<Headers extends Schema | undefined = Schema> =
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
