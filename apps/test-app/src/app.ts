import { App, Stack } from "aws-cdk-lib";
import { Workflow } from "@eventual/aws-cdk";
import path from "path";

const app = new App();

const stack = new Stack(app, "test-eventual");

new Workflow(stack, "workflow1", {
  entry: path.resolve(
    __dirname,
    "node_modules",
    "test-app-runtime",
    "lib",
    "workflow.js"
  ),
});
