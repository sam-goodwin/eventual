import {
  ApiRequest,
  ApiResponse,
  TypedApiRequest,
  TypedApiResponse,
} from "./api-request.js";
import { ApiResponses, HeaderValues, ParamValues } from "./api-schema.js";

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => ApiResponse | Promise<ApiResponse>;

export type TypedRouteHandler<
  Input,
  Responses extends ApiResponses = ApiResponses,
  Headers extends HeaderValues = HeaderValues,
  Params extends ParamValues = ParamValues
> = (
  request: TypedApiRequest<Input, Responses, Headers, Params>
) =>
  | TypedApiResponse<Responses, keyof Responses>
  | Promise<TypedApiResponse<Responses, keyof Responses>>;
