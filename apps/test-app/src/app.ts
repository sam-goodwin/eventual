import { App, Stack } from "aws-cdk-lib";
import { Workflow } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

new Workflow(stack, "workflow1", {
  entry: require.resolve("test-app-runtime/lib/my-workflow.js"),
});
