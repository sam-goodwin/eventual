import { MiddlewareObj } from "@middy/core";

/**
 * A middy middleware to handle crashed api lambdas, emitting the lambda's error in the response body
 * This gives us visibility into api issues, and is especially useful combined with the cli's debug flag
 */
export const errorMiddleware: MiddlewareObj = {
  onError: (req) => {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: req.error }, undefined, 2),
    };
  },
};