import { MiddlewareObj } from "@middy/core";

export const errorMiddleware: MiddlewareObj = {
  onError: (req) => {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: req.error }, undefined, 2),
    };
  },
};
