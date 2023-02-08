import { command } from "@eventual/core";
import { z } from "zod";

/**
 * Adds a Stock to the database.
 */
export const addStock = command(
  "addStock",
  {
    path: "/stocks",
    method: "GET",
    input: z.object({
      /**
       * The Stock Ticker
       */
      ticker: z.string(),
    }),
    output: z.object({
      stockId: z.string(),
    }),
  },
  async (request) => {
    return {
      stockId: request.ticker,
    };
  }
);
