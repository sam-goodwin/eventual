import { api, HttpError, HttpRequest, HttpResponse } from "@eventual/core";
import { z } from "zod";

export class RateLimitedError extends HttpError("RateLimitedError", {
  status: 200,
  body: z.object({
    message: z.string(),
  }),
}) {}

export class AddStockRequest extends HttpRequest("AddStockRequest", {
  headers: {
    "Content-Type": z.string(),
  },
  body: z.object({
    ticker: z.string(),
  }),
}) {}

export class AddStockResponse extends HttpResponse("AddStockResponse", {
  body: z.object({
    stockId: z.string(),
  }),
}) {}

export const addStock = api.post(
  "/stocks",
  {
    request: AddStockRequest,
    response: AddStockResponse,
    errors: [RateLimitedError],
  },
  async (request) => {
    if (typeof request === "object") {
      if (request) {
        return {
          response: new AddStockResponse({
            stockId: "",
          }),
        };
      } else {
        return {
          response: {
            type: "AddStockResponse",
            body: {
              stockId: "",
            },
          },
        };
      }
    } else if (request) {
      return {
        error: new RateLimitedError({
          message: "foo",
        }),
      };
    } else {
      return {
        error: {
          type: "RateLimitedError",
          body: {
            message: "you dun goofed",
          },
        },
      };
    }
  }
);
