import { api, duration } from "@eventual/core";
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
    return {
      status: 200,
    };
  }
);
