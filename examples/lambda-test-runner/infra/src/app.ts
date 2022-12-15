import { App, Stack } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as eventual from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "example-test-runner");

// const accountTable = new aws_dynamodb.Table(stack, "Runs", {
//   partitionKey: {
//     name: "pk",
//     type: aws_dynamodb.AttributeType.STRING,
//   },
//   billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
// });

const testRunner = new eventual.Service(stack, "TestRunner", {
  entry: require.resolve("example-test-runner-runtime/lib/test-runner.js"),
  name: "test-runner",
  // environment: {
  //   TABLE_NAME: accountTable.tableName,
  // },
});

const testLambda = new NodejsFunction(stack, "testFunction", {
  entry: require.resolve("example-test-runner-runtime/lib/test-function.js"),
});

// composite grant principal does not work with lambda.
testLambda.grantInvoke(testRunner.activities.worker);
