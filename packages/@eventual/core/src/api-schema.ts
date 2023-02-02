import type z from "zod";
import type { TypedApiRequest, TypedApiResponse } from "./api-request.js";
import { HttpStatus } from "./http-status.js";

type ParamValue = string | number | boolean;

export interface ParamsSchema {
  [parameterName: string]: z.ZodType<ParamValue | ParamValue[]>;
}

export interface ParamValues {
  [parameterName: string]: ParamValue | ParamValue[];
}

export interface HeadersSchema {
  [headerName: string]: z.ZodType<undefined | string | string[]>;
}

export interface HeaderValues {
  [headerName: string]: string | string[] | undefined;
}

export type ApiResponses = {
  [status in HttpStatus]?: ApiResponseValue;
};

export type ApiResponseSchemas = {
  [status in HttpStatus]?: z.ZodType | ApiResponseSchema;
};

export interface ApiResponseSchema {
  headers?: HeadersSchema;
  body: z.ZodType;
}

export interface ApiResponseValue {
  headers?: HeaderValues;
  body: any;
}

export interface GetApi<
  Path extends string,
  Responses extends ApiResponses,
  Headers extends HeaderValues,
  Params extends ParamValues,
  ResponseHeaders extends HeaderValues
> extends Api<Path, undefined, Responses, Headers, Params, ResponseHeaders> {}

export interface Api<
  Path extends string,
  Input,
  Responses extends ApiResponses,
  Headers extends HeaderValues,
  Params extends ParamValues,
  OutputHeaders extends HeaderValues
> {
  path: Path;
  input: z.ZodType<Input>;
  responses: {};
  (request: TypedApiRequest<Input, Headers, Params>): Promise<
    TypedApiResponse<Responses, keyof Responses, OutputHeaders>
  >;
}
