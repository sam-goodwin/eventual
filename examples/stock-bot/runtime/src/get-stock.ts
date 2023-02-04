import { api, duration, HttpError, HttpResponse } from "@eventual/core";
import { z } from "zod";

class GetStockResponse extends HttpResponse("GetStockResponse", {
  body: z.string(),
}) {}

class NotFound extends HttpError("NotFound", {
  status: 404,
}) {}

export const getStock = api.get(
  "/stock/:stockId",
  {
    memorySize: 512,
    timeout: duration(1, "minute"),
    params: {
      stockId: z.string().optional(),
    },
    output: [GetStockResponse],
    errors: [NotFound],
  },
  async (_request) => {
    return {
      status: 404,
    };
  }
);
