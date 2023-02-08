import type { HttpClient } from "@eventual/core";

import type * as myService from "./index.js";

declare const client: HttpClient<typeof myService>;

try {
  client.addStock({
    ticker: "",
  });
  const result = await client.addStock({
    ticker: "",
  });
  result.stockId;
} catch (err) {}
