import {
  api,
  duration,
  HttpError,
  HttpRequest,
  HttpResponse,
} from "@eventual/core";
import { z } from "zod";

class GetStockRequest extends HttpRequest("GetStockRequest", {
  params: {
    stockId: z.string(),
  },
  body: z.undefined(),
}) {}

class GetStockResponse extends HttpResponse("GetStockResponse", {
  headers: {
    "Content-Type": z.string().optional(),
  },
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
    input: GetStockRequest,
    output: GetStockResponse,
    errors: [NotFound],
  },
  async (_request) => {
    return {
      status: 200,
      headers: {
        "Content-Type": "",
      },
      body: "",
    };
  }
);

export const saveStock = api.put(
  "/stock/:stockId",
  {
    input: {
      body: z.string(),
      params: {
        stockId: z.number().int(),
      },
      headers: {
        key: z.string(),
      },
    },
  },
  async (request) => {
    request.body;
    request.params.stockId;
    return {
      status: 200,
      body: request.body,
    };
  }
);
