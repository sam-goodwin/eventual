import { api, ApiResponse, duration } from "@eventual/core";
import { z } from "zod";

export const getStock = api.get(
  "/stock/:stockId",
  {
    memorySize: 512,
    timeout: duration(1, "minute"),
    params: {
      stockId: z.string(),
    },
  },
  async (_request) => {
    return new ApiResponse();
  }
);

export const addStock = api.post(
  "/stocks",
  {
    timeout: duration(1, "minute"),
    request: z.object({
      ticker: z.string(),
    }),
    headers: {
      "Content-Type": z.string(),
    },
    responses: {
      200: {
        headers: {
          "X-Rate-Limit": z.string(),
        },
        body: z.object({
          stockId: z.string(),
        }),
      },
      400: z.object({
        error: z.string(),
      }),
    },
  },
  async (request, ctx) => {
    request.headers["Content-Type"];
    return ctx.response({
      status: 200,
      body: {
        stockId: "stock-id",
      },
    });
  }
);
