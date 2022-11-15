import { App, aws_dynamodb, Stack } from "aws-cdk-lib";
import { Workflow } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

new Workflow(stack, "Benchmark", {
  entry: require.resolve("test-app-runtime/lib/time-benchmark.js"),
});

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
