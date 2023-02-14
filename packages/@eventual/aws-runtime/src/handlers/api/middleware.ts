import { extendsError } from "@eventual/core";
import middy, { MiddlewareObj } from "@middy/core";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import util from "util";

/**
 * A middy middleware to handle crashed api lambdas, emitting the lambda's error in the response body
 * This gives us visibility into api issues, and is especially useful combined with the cli's debug flag
 */
export const errorMiddleware: MiddlewareObj = {
  onError: (req) => {
    return {
      statusCode: 500,
      body: JSON.stringify(
        extendsError(req.error)
          ? {
              error: req.error.name,
              message: req.error.message,
              stack: req.error.stack,
            }
          : { error: util.inspect(req.error) },
        undefined,
        2
      ),
    };
  },
};

export function withErrorMiddleware<TEvent>(
  handler: APIGatewayProxyHandlerV2<TEvent>
): middy.MiddyfiedHandler<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2<TEvent>,
  Error,
  any
> {
  return middy(handler).use(errorMiddleware);
}
