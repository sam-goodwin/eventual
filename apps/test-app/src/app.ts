import { App, Stack } from "aws-cdk-lib";
import { Eventual } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

new Eventual(stack, "eventual", {
  workflows: {
    "my-workflow": require.resolve("test-app-runtime/lib/my-workflow.js"),
  },
});
