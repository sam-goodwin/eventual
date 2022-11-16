import {
  App,
  aws_dynamodb,
  aws_lambda,
  aws_lambda_nodejs,
  Duration,
  Stack,
} from "aws-cdk-lib";
import { Workflow } from "@eventual/aws-cdk";

const app = new App();

const stack = new Stack(app, "test-eventual");

const benchWorkflow = new Workflow(stack, "Benchmark", {
  entry: require.resolve("test-app-runtime/lib/time-benchmark.js"),
  orchestrator: {
    reservedConcurrentExecutions: 100,
  },
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
  environment: {
    FUNCTION_ARN: benchWorkflow.startWorkflowFunction.functionArn,
  },
  timeout: Duration.minutes(1),
});

benchWorkflow.startWorkflowFunction.grantInvoke(bench);

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
