import type { z } from "zod";

export type ParamValue = string | number | boolean;

export interface ParamsSchema {
  [parameterName: string]: z.ZodType<ParamValue | ParamValue[]>;
}

export type ParamsEnvelopeValues<
  Params extends ParamsSchema | undefined = ParamsSchema
> = ParamsSchema extends Params
  ? {
      params?: {
        [paramName: string]: ParamValue | ParamValue[] | undefined;
      };
    }
  : Params extends undefined
  ? {
      params?: {
        [paramName: string]: ParamValue | ParamValue[] | undefined;
      };
    }
  : { [header in keyof Params]?: undefined } extends Params
  ? {
      params?: {
        [paramName in keyof Params]: z.infer<
          Exclude<Params, undefined>[paramName]
        >;
      };
    }
  : {
      params: {
        [paramName in keyof Params]: z.infer<
          Exclude<Params, undefined>[paramName]
        >;
      };
    };

export type ParamValues<
  Params extends ParamsSchema | undefined = ParamsSchema | undefined
> = ParamsSchema extends Params
  ? {
      [paramName: string]: ParamValue | ParamValue[] | undefined;
    }
  : Params extends undefined
  ? {
      [paramName: string]: ParamValue | ParamValue[] | undefined;
    }
  : {
      [paramName in keyof Params]: z.infer<
        Exclude<Params, undefined>[paramName]
      >;
    };
