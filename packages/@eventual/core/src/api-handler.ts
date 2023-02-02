import {
  ApiRequest,
  ApiResponse,
  TypedApiHeaders,
  TypedApiRequest,
  TypedApiResponse,
} from "./api-request.js";
import {
  ApiResponses,
  ApiResponseValue,
  HeaderValues,
  ParamValues,
} from "./api-schema.js";

export type RouteHandler = (
  request: ApiRequest,
  ...args: any
) => ApiResponse | Promise<ApiResponse>;

export type TypedRouteHandler<
  Input,
  Responses extends ApiResponses = ApiResponses,
  Headers extends HeaderValues = HeaderValues,
  Params extends ParamValues = ParamValues,
  OutputHeaders extends HeaderValues = HeaderValues
> = (
  request: TypedApiRequest<Input, Headers, Params>,
  context: TypedRouteContext<Responses, OutputHeaders>
) =>
  | TypedApiResponse<Responses, keyof Responses, OutputHeaders>
  | Promise<TypedApiResponse<Responses, keyof Responses, OutputHeaders>>;

export type TypedRouteContext<
  Responses extends ApiResponses,
  OutputHeaders extends HeaderValues
> = {
  response<Status extends keyof Responses>(
    props: {
      status: Status;
      body: Responses[Status] extends ApiResponseValue
        ? Responses[Status]["body"]
        : undefined;
    } & TypedApiHeaders<
      Responses[Status] extends ApiResponseValue
        ? Responses[Status]["headers"] extends undefined
          ? HeaderValues
          : Responses[Status]["headers"]
        : HeaderValues
    >
  ): TypedApiResponse<Responses, Status, OutputHeaders>;
};
