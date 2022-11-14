import { App, Stack } from "aws-cdk-lib";
import { EventualApi, Workflow } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

const myWorkflow = new Workflow(stack, "my-workflow", {
  entry: require.resolve("test-app-runtime/lib/my-workflow.js"),
});

new EventualApi(stack, "eventual-api", { workflows: [myWorkflow] });
