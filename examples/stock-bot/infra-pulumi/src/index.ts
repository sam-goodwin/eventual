import * as eventual from "@eventual/aws-pulumi";

new eventual.Service("StockBot", {
  entry: require.resolve("example-stock-bot-runtime"),
  name: "stock-bot",
  environment: {
    TABLE_NAME: "name",
  },
});
