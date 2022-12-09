import * as eventual from "@eventual/aws-cdk";
import { App, CfnOutput, Stack } from "aws-cdk-lib";
import { ArnPrincipal, Role } from "aws-cdk-lib/aws-iam";

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
testService.api.cliRole.grantAssumeRole(role);
role.addToPolicy(eventual.Service.listServicesPolicyStatement(stack));

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
