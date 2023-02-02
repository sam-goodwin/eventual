import type z from "zod";
import { RouteHandler, TypedRouteHandler } from "./api-handler.js";
import {
  Api,
  ApiResponseSchemas,
  GetApi,
  HeadersSchema,
  HeaderValues,
  ParamsSchema,
  ParamValues,
} from "./api-schema.js";
import { FunctionRuntimeProps } from "./function-props.js";
import { HttpStatus } from "./http-status.js";
import type { InferOrDefault } from "./type-util.js";

export interface ApiRouteRuntimeProps<
  Input extends z.ZodType = z.ZodAny,
  Responses extends ApiResponseSchemas = ApiResponseSchemas,
  Headers extends HeadersSchema | undefined = undefined,
  Params extends ParamsSchema | undefined = undefined
> extends FunctionRuntimeProps {
  request?: Input;
  headers?: Headers;
  params?: Params;
  responses?: Responses;
}

export interface ApiRouteFactory {
  <
    Path extends string,
    Input extends z.ZodType,
    Responses extends ApiResponseSchemas,
    Headers extends HeadersSchema | undefined,
    Params extends ParamsSchema | undefined
  >(
    path: Path,
    props: ApiRouteRuntimeProps<Input, Responses, Headers, Params>,
    ...handlers: TypedRouteHandler<
      z.infer<Input>,
      InferApiResponses<Responses>,
      InferOrDefault<Headers, HeaderValues>,
      InferOrDefault<Params, ParamValues>
    >[]
  ): Api<
    Path,
    z.infer<Input>,
    InferApiResponses<Responses>,
    InferOrDefault<Headers, HeaderValues>,
    InferOrDefault<Params, ParamValues>
  >;
  <Path extends string>(path: Path, ...handlers: RouteHandler[]): Api<
    Path,
    any,
    any,
    HeaderValues,
    ParamValues
  >;
}

export interface GetRouteRuntimeProps<
  Responses extends ApiResponseSchemas = {
    [status in HttpStatus]?: z.ZodType;
  },
  Headers extends HeadersSchema | undefined = undefined,
  Params extends ParamsSchema | undefined = undefined,
  DefaultResponseHeaders extends HeadersSchema | undefined = undefined
> extends FunctionRuntimeProps {
  headers?: Headers;
  params?: Params;
  responses?: Responses;
  DefaultResponseHeaders?: DefaultResponseHeaders;
}

export interface GetApiRouteFactory {
  <
    Path extends string,
    Responses extends ApiResponseSchemas,
    Headers extends HeadersSchema | undefined,
    Params extends ParamsSchema | undefined,
    DefaultResponseHeaders extends HeadersSchema | undefined
  >(
    path: Path,
    props: GetRouteRuntimeProps<Responses, Headers, Params>,
    ...handlers: RouteHandler[]
  ): GetApi<
    Path,
    InferApiResponses<Responses>,
    InferOrDefault<Headers, HeaderValues>,
    InferOrDefault<Params, ParamValues>
  >;
  // TODO: deprecate this - only support type-safe
  <Path extends string>(
    path: Path,
    ...handlers: TypedRouteHandler<undefined>[]
  ): GetApi<Path, any, HeaderValues, ParamValues>;
}

type InferApiResponses<Responses extends ApiResponseSchemas> = {
  [status in keyof Responses]: Responses[status] extends {
    headers?: infer Headers extends HeadersSchema;
    body: infer Body extends z.ZodType;
  }
    ? {
        headers?: {
          [header in keyof Headers]: z.infer<Headers[header]>;
        };
        body: z.infer<Body>;
      }
    : Responses[status] extends z.ZodType<any>
    ? z.infer<Responses[status]>
    : {
        headers?: HeaderValues;
        body: z.ZodAny;
      };
};
