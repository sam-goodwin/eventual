import type { z } from "zod";

export type Param = string | number | boolean;

export interface Params {
  [parameterName: string]: Param | Param[];
}

export declare namespace Params {
  export interface Schema {
    [parameterName: string]: z.ZodType<Param | Param[]>;
  }

  export type Envelope<Params extends Schema | undefined = Schema> =
    Schema extends Params
      ? {
          params?: Params;
        }
      : Params extends undefined
      ? {
          params?: Params;
        }
      : { [header in keyof Params]?: undefined } extends Params
      ? {
          params?: FromSchema<Params>;
        }
      : {
          params: FromSchema<Params>;
        };

  export type FromSchema<
    Params extends Schema | undefined = Schema | undefined
  > = Schema extends Params
    ? Params
    : Params extends undefined
    ? Params
    : {
        [paramName in keyof Params]: z.infer<
          Exclude<Params, undefined>[paramName]
        >;
      };
}
