import { ServiceClient } from "@eventual/client";
import { HttpError } from "@eventual/core";

import type * as myService from "./index.js";

const client = new ServiceClient<typeof myService>({
  serviceUrl: "https://my-api.com",
});

try {
  const result = await client.addStock({
    ticker: "TSLA",
  });
  result.stockId;
} catch (err) {
  if (err instanceof HttpError) {
    if (err.code === 404) {
      err.message;
    }
  }
}
