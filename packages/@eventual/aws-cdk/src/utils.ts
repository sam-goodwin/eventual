import { Runtime, RuntimeFamily } from "aws-cdk-lib/aws-lambda";

export const NODE_18_X = new Runtime("nodejs18.x", RuntimeFamily.NODEJS, {
  supportsInlineCode: true,
});
