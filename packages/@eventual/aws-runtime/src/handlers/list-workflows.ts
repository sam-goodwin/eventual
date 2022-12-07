import "@eventual/entry/injected";

import { workflows } from "@eventual/core";
import { withErrorMiddleware } from "./api/middleware.js";

export default withErrorMiddleware(async function () {
  return Array.from(workflows().keys());
});
