import { App, Stack } from "aws-cdk-lib";
import * as eventual from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "example-stock-bot");

new eventual.Service(stack, "StockBot", {
  entry: require.resolve("example-stock-bot-runtime"),
  name: "stock-bot",
});
