import * as eventual from "@eventual/aws-cdk";
import { DebugDashboard, ServiceDashboard } from "@eventual/aws-cdk";
import { LogLevel } from "@eventual/core";
import { App, CfnOutput, CfnResource, Stack } from "aws-cdk-lib";
import {
  ArnPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import path from "path";
import { ChaosExtension } from "./chaos-extension";

const app = new App();

const stack = new Stack(app, "eventual-tests");

const assumeRoleArn = stack.node.tryGetContext("assumeRole") as string;

const role = new Role(stack, "testRole", {
  assumedBy: new ArnPrincipal(assumeRoleArn),
});

const testQueue = new Queue(stack, "testQueue");

const testService = new eventual.Service(stack, "testService", {
  name: "eventual-tests",
  entry: require.resolve("tests-runtime"),
  environment: {
    TEST_QUEUE_URL: testQueue.queueUrl,
  },
  logging: {
    logLevel: LogLevel.DEBUG,
  },
});

testService.api.grantInvokeHttpServiceApi(role);
testService.cliRole.grantAssumeRole(role);
eventual.Service.grantDescribeParameters(stack, role);
testService.serviceDataSSM.grantRead(role);
role.addToPolicy(
  new PolicyStatement({
    actions: ["ssm:DescribeParameters"],
    resources: ["*"],
  })
);

const pipeRole = new Role(stack, "pipeRole", {
  assumedBy: new ServicePrincipal("pipes"),
});

testQueue.grantConsumeMessages(pipeRole);
testQueue.grantSendMessages(testService);

/**
 * Chaos Testing
 */

const chaosExtension = new ChaosExtension(stack, "chaos");

chaosExtension.addToFunction(testService.activities.worker);
chaosExtension.addToFunction(testService.workflows.orchestrator);

chaosExtension.grantReadWrite(role);

/**
 * Async lambda test.
 */

const asyncWriterFunction = new NodejsFunction(stack, "asyncWriterFunction", {
  entry: path.join(
    require.resolve("tests-runtime"),
    "../async-writer-handler.js"
  ),
  handler: "handle",
  environment: {
    TEST_SERVICE_URL: testService.api.gateway.apiEndpoint,
  },
});
asyncWriterFunction.grantInvoke(pipeRole);
testService.api.grantInvokeHttpServiceApi(asyncWriterFunction);

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-pipes-pipe.html
new CfnResource(stack, "pipe", {
  type: "AWS::Pipes::Pipe",
  properties: {
    TargetParameters: {
      InputTemplate:
        '{"token": "<$.body.token>","type":"<$.body.type>","ingestionTime":"<aws.pipes.event.ingestion-time>"}',
    },
    Name: stack.stackName + "_pipe",
    RoleArn: pipeRole.roleArn,
    Source: testQueue.queueArn,
    Target: asyncWriterFunction.functionArn,
  },
});

new ServiceDashboard(stack, "dashboard", {
  service: testService,
});

new DebugDashboard(stack, "debug-dash", {
  service: testService,
});

new CfnOutput(stack, "roleArn", {
  value: role.roleArn,
  exportName: "RoleArn",
});

new CfnOutput(stack, "serviceUrl", {
  value: testService.api.gateway.apiEndpoint,
  exportName: "ServiceUrl",
});

new CfnOutput(stack, "chaosParamName", {
  value: chaosExtension.ssm.parameterName,
});
