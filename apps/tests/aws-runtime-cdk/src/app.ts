import * as eventual from "@eventual/aws-cdk";
import { App, CfnOutput, Stack } from "aws-cdk-lib";
import {
  ArnPrincipal,
  Policy,
  PolicyDocument,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";

const app = new App();

const stack = new Stack(app, "eventual-tests");

const assumeRoleArn = stack.node.tryGetContext("assumeRole") as string;

const role = new Role(stack, "testRole", {
  assumedBy: new ArnPrincipal(assumeRoleArn),
});

const testService = new eventual.Service(stack, "testService", {
  name: "eventual-tests",
  entry: require.resolve("tests-runtime"),
});

testService.grantRead(role);
testService.grantStartWorkflow(role);
testService.serviceDataSSM.grantRead(role);

// give the CLI permissions
new Policy(stack, "CLIPolicy", {
  roles: [Role.fromRoleArn(stack, "AssumeRole", assumeRoleArn)],
  document: new PolicyDocument({
    statements: [
      new PolicyStatement({
        actions: ["ssm:DescribeParameters"],
        resources: ["*"],
      }),
      new PolicyStatement({
        actions: ["iam:GetRole"],
        resources: [role.roleArn],
      }),
    ],
  }),
});

new CfnOutput(stack, "roleArn", {
  value: role.roleArn,
  exportName: "RoleArn",
});

new CfnOutput(stack, "workflowQueueUrl", {
  value: testService.workflowQueue.queueUrl,
  exportName: "QueueUrl",
});

new CfnOutput(stack, "serviceTableName", {
  value: testService.table.tableName,
  exportName: "TableName",
});
