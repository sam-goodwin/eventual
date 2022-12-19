import { activity, asyncResult, event, workflow } from "@eventual/core";
import { randomInt } from "crypto";

const StockActionResultEvent = event<{
  symbol: string;
  action: "buy" | "sell";
  price: number;
  quantity: number;
}>("StockActionResult");

interface RequestApprovalEventPayload {
  symbol: string;
  recommendation: "buy" | "sell";
  price: number;
  token: string;
}

const RequestApprovalEvent =
  event<RequestApprovalEventPayload>("RequestApproval");

// auto approval for the human request approval event.
RequestApprovalEvent.on(async (event) => {
  await requestApproval.complete({
    activityToken: event.token,
    result: { approve: true },
  });
});

export const stockBot = workflow("stock-bot", async () => {
  const symbol = "tsla";
  // get stock price
  const { price } = await getStockPrice(symbol);
  // make decision
  const { decision } = await makeDecision(price);
  // human approval
  const { approve } = await requestApproval({
    price,
    recommendation: decision,
    symbol,
  });
  if (approve) {
    // buy or sell
    const { qty } =
      decision === "buy"
        ? await buyStock({ symbol })
        : await sellStock({ symbol });

    // report
    await StockActionResultEvent.publish({
      symbol,
      action: decision,
      price,
      quantity: qty,
    });

    return "purchase made";
  }

  return "rejected";
});

/**
 * Emulates the effort to lookup the current price of the symbol.
 * This will likely make an authenticated API call to some other service.
 */
const getStockPrice = activity("getStockPrice", async (_symbol: string) => {
  return { price: randomInt(1, 100) };
});

/**
 * Emulates some complex logic that determine to buy or sell, this could be ML or another algorithm.
 */
const makeDecision = activity("makeDecision", async (price: number) => {
  return { decision: price < 50 ? ("buy" as const) : ("sell" as const) };
});

/**
 * Request human approval to make the purchase. For this example we'll auto-approve,
 * but a complete application would display the choice to a user
 * and respond back to the application with the decision.
 */
const requestApproval = activity(
  "requestApproval",
  async (event: Omit<RequestApprovalEventPayload, "token">) => {
    return asyncResult<{ approve: boolean }>(async (token) => {
      await RequestApprovalEvent.publish({ ...event, token });
    });
  }
);

/**
 * Emulates the effort to buy the stock. This will likely make an authenticated API call to some other service.
 */
const buyStock = activity("buyStock", async (_request: { symbol: string }) => {
  return { qty: randomInt(1, 10) };
});

/**
 * Emulates the effort to sell the stock. This will likely make an authenticated API call to some other service.
 */
const sellStock = activity(
  "sellStock",
  async (_request: { symbol: string }) => {
    return { qty: randomInt(1, 10) };
  }
);