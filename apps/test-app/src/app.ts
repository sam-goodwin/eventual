import { App, aws_dynamodb, Stack } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Workflow } from "@eventual/aws-cdk";
import { Tester } from "./tester";

const app = new App();

const stack = new Stack(app, "test-eventual");

const accountTable = new aws_dynamodb.Table(stack, "Accounts", {
  partitionKey: {
    name: "pk",
    type: aws_dynamodb.AttributeType.STRING,
  },
  billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
});

const openAccount = new Workflow(stack, "OpenAccount", {
  entry: require.resolve("test-app-runtime/lib/open-account.js"),
  environment: {
    TABLE_NAME: accountTable.tableName,
  },
});

accountTable.grantReadWriteData(openAccount);

new Workflow(stack, "workflow1", {
  entry: require.resolve("test-app-runtime/lib/my-workflow.js"),
});

const testHarness = new NodejsFunction(stack, "testing", {
  entry: require.resolve("test-app-runtime/lib/test.js"),
  environment: {
    WORKFLOW_STARTER: openAccount.startWorkflowFunction.functionName,
  },
});

openAccount.startWorkflowFunction.grantInvoke(testHarness);

new Tester(stack, "tester");
