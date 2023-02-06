import type { z } from "zod";

export type HttpHeaderValue = undefined | string | number | boolean;

export interface HttpHeaders {
  [headerName: string]: HttpHeaderValue;
}

export declare namespace HttpHeaders {
  export interface Schema {
    [headerName: string]: z.ZodType<HttpHeaderValue>;
  }

  export type Envelope<
    Headers extends Schema | undefined = Schema | undefined
  > = undefined extends Headers
    ? {
        headers?: HttpHeaders;
      }
    : Schema extends Headers
    ? {
        headers?: HttpHeaders;
      }
    : {
        [headerName in keyof Headers]: undefined;
      } extends HttpHeaders.FromSchema<Headers>
    ? {
        headers?: z.infer<z.ZodObject<Exclude<Headers, undefined>>>;
      }
    : {
        headers: z.infer<z.ZodObject<Exclude<Headers, undefined>>>;
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

  export type IsOptional<Headers extends Schema | undefined = Schema> =
    Schema extends Headers
      ? true
      : Headers extends undefined
      ? true
      : { [header in keyof Headers]?: undefined } extends Headers
      ? true
      : false;
}
