import { duration, command } from "@eventual/core";
import { z } from "zod";

export interface Stock {
  ticker: string;
  price: number;
}

export const getStock = command(
  "getStock",
  {
    method: "GET",
    path: "/stock/:ticker",
    memorySize: 512,
    timeout: duration(1, "minute"),
    input: z.object({ ticker: z.string() }),
  },
  async (input): Promise<Stock> => {
    return {
      ticker: input.ticker,
      price: 1,
    };
  }
);
