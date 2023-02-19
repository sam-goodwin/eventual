import {
  App,
  aws_dynamodb,
  aws_lambda,
  aws_lambda_nodejs,
  CfnOutput,
  Duration,
  Stack,
} from "aws-cdk-lib";
import * as eventual from "@eventual/aws-cdk";
import { ServiceDashboard } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

const benchService = new eventual.Service(stack, "Benchmark", {
  entry: require.resolve("test-app-runtime/lib/time-benchmark.js"),
  workflows: {
    reservedConcurrentExecutions: 100,
  },
});

new ServiceDashboard(stack, "BenchmarkDashboard", {
  service: benchService,
});

const bench = new aws_lambda_nodejs.NodejsFunction(stack, "BenchmarkFunc", {
  entry: require.resolve("test-app-runtime/lib/bench.js"),
  handler: "handle",
  runtime: aws_lambda.Runtime.NODEJS_16_X,
  architecture: aws_lambda.Architecture.ARM_64,
  bundling: {
    // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
    // cannot output as .mjs file as ulid does not support it.
    mainFields: ["module", "main"],
    esbuildArgs: {
      "--conditions": "module,import,require",
    },
    metafile: true,
  },
  timeout: Duration.minutes(1),
  environment: {
    EVENTUAL_SERVICE_URL: benchService.gateway.apiEndpoint,
  },
});

benchService.grantInvokeHttpServiceApi(bench);

const accountTable = new aws_dynamodb.Table(stack, "Accounts", {
  partitionKey: {
    name: "pk",
    type: aws_dynamodb.AttributeType.STRING,
  },
  billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
});

const openAccount = new eventual.Service(stack, "OpenAccount", {
  entry: require.resolve("test-app-runtime/lib/open-account.js"),
  name: "open-account",
  environment: {
    TABLE_NAME: accountTable.tableName,
  },
});

new CfnOutput(stack, "open-account-api-url", {
  value: openAccount.gateway.apiEndpoint,
});

new eventual.Service(stack, "my-service", {
  name: "my-service",
  entry: require.resolve("test-app-runtime/lib/my-workflow.js"),
});

new eventual.Service(stack, "slack-bot", {
  name: "slack-bot",
  entry: require.resolve("test-app-runtime/lib/slack-bot.js"),
});
