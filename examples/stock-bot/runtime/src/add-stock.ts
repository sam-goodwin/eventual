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
  headers: {
    Cache: z.string().optional(),
  },
  body: z.object({
    stockId: z.string(),
  }),
}) {}

export const addStock = api.post(
  "/stocks",
  {
    input: AddStockRequest,
    output: AddStockResponse,
    errors: [RateLimitedError],
  },
  async (request) => {
    return {
      status: 200,
      body: {
        stockId: request.body.ticker,
      },
    };
  }
);
