import "@eventual/entry/injected";

import { workflows } from "@eventual/core";
import { withErrorMiddleware } from "./middleware.js";

export const handler = withErrorMiddleware(async function () {
  return Array.from(workflows().keys());
});
