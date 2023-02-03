import { App, Stack } from "aws-cdk-lib";
import * as eventual from "@eventual/aws-cdk";

import type * as stockbot from "example-stock-bot-runtime";

const app = new App();

const stack = new Stack(app, "example-stock-bot");

new eventual.Service<typeof stockbot>(stack, "StockBot", {
  entry: require.resolve("example-stock-bot-runtime"),
  name: "stock-bot",
  api: {
    handlers: {
      addStock: {},
    },
  },
  events: {
    handlers: {},
  },
});
