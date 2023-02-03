import { api, HttpError, HttpRequest, HttpResponse } from "@eventual/core";
import { z } from "zod";

export class RateLimitedError extends HttpError("RateLimitedError", {
  status: 400,
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
        return new AddStockResponse({
          body: {
            stockId: "new stock id",
          },
        });
      } else {
        return {
          type: "AddStockResponse" as const,
          status: 200,
          body: {
            stockId: "",
          },
        };
      }
    } else if (request) {
      return new RateLimitedError({
        message: "foo",
      });
    } else {
      return {
        type: "RateLimitedError" as const,
        status: 400,
        body: {
          message: "you dun goofed",
        },
      };
    }
  }
);
