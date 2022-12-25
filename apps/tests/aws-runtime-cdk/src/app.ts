/* eslint-disable no-new */
import { App, CfnOutput, CfnResource, Stack } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import {
  ArnPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as eventual from "@eventual/aws-cdk";
import path from "path";

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
});

testService.grantRead(role);
testService.grantStartWorkflow(role);
testService.cliRole.grantAssumeRole(role);
eventual.Service.grantDescribeParameters(stack, role);
testService.serviceDataSSM.grantRead(role);
testService.workflows.grantFilterOrchestratorLogs(role);
testService.activities.grantFilterWorkerLogs(role);
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

const asyncWriterFunction = new NodejsFunction(stack, "asyncWriterFunction", {
  entry: path.join(
    require.resolve("tests-runtime"),
    "../async-writer-handler.js"
  ),
  handler: "handle",
  environment: {
    TEST_TABLE_NAME: testService.table.tableName,
    TEST_ACTIVITY_TABLE_NAME: testService.activities.table.tableName,
    TEST_QUEUE_URL: testService.workflows.queue.queueUrl,
  },
});
asyncWriterFunction.grantInvoke(pipeRole);

testService.grantFinishActivity(asyncWriterFunction);

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

new CfnOutput(stack, "roleArn", {
  value: role.roleArn,
  exportName: "RoleArn",
});

new CfnOutput(stack, "workflowQueueUrl", {
  value: testService.workflows.queue.queueUrl,
  exportName: "QueueUrl",
});

new CfnOutput(stack, "serviceTableName", {
  value: testService.table.tableName,
  exportName: "TableName",
});

new CfnOutput(stack, "activityTableName", {
  value: testService.activities.table.tableName,
  exportName: "ActivityTableName",
});
