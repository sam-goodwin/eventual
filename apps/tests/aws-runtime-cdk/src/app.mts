import { CorsHttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import * as eventual from "@eventual/aws-cdk";
import { DebugDashboard, ServiceDashboard } from "@eventual/aws-cdk";
import { LogLevel } from "@eventual/core";
import { App, CfnOutput, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  ArnPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Aspects, Duration } from "aws-cdk-lib/core";
import {
  AwsSolutionsChecks,
  HIPAASecurityChecks,
  NagPack,
  NagPackProps,
  NagReportFormat,
} from "cdk-nag";
import { createRequire as topLevelCreateRequire } from "module";
import path from "path";
import { ChaosExtension } from "./chaos-extension.js";

import { ComplianceStandard } from "@eventual/aws-cdk";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import type * as testServiceRuntime from "tests-runtime";

const require = topLevelCreateRequire(import.meta.url);

const currentIdent = await new STSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
}).send(new GetCallerIdentityCommand({}));
const assumeRoleArn = currentIdent.Arn;

if (!assumeRoleArn) {
  throw new Error("Could not assume role to start CDK synth");
}

const app = new App();

const stack = new Stack(app, "eventual-tests");

const role = new Role(stack, "testRole", {
  assumedBy: new ArnPrincipal(assumeRoleArn),
});

const testQueue = new Queue(stack, "testQueue");
const testTable = new Table(stack, "testTable", {
  partitionKey: { name: "pk", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "ttl",
});

const testService = new eventual.Service<typeof testServiceRuntime>(
  stack,
  "testService",
  {
    name: "eventual-tests",
    entry: require.resolve("tests-runtime"),
    environment: {
      TEST_QUEUE_URL: testQueue.queueUrl,
      TEST_TABLE_NAME: testTable.tableName,
    },
    compliance: {
      standards: [ComplianceStandard.HIPAA],
    },
    system: {
      workflowService: {
        logLevel: LogLevel.DEBUG,
      },
    },
    buckets: {
      myBucket: {
        bucketName: `super-random-test-bucket-${stack.account}-${stack.region}`,
      },
    },
    search: {
      serverless: false,
      domainName: "eventual-tests-2",
    },
    cors: {
      allowOrigins: ["http://some-url.com", "http://localhost:3000"],
      allowHeaders: ["authorization", "content-type"],
      allowMethods: [CorsHttpMethod.ANY],
      maxAge: Duration.days(1),
    },
  }
);

// these run linting rules on the CDK code and should all pass to enforce compliance
enableNagPack(AwsSolutionsChecks);
enableNagPack(HIPAASecurityChecks);
function enableNagPack<P extends NagPackProps>(
  Pack: new (props: P) => NagPack,
  props?: P
) {
  //  TODO: enable once we comply with all policies and tests pass in deployment
  const nag = false;
  if (nag) {
    Aspects.of(testService).add(
      new Pack({
        reports: true,
        reportFormats: [NagReportFormat.CSV, NagReportFormat.JSON],
        verbose: true,
        ...props,
      } as P)
    );
  }
}

testService.grantInvokeHttpServiceApi(role);
testService.system.accessRole.grantAssumeRole(role);
eventual.Service.grantDescribeParameters(stack, role);
testService.system.serviceMetadataSSM.grantRead(role);
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
testQueue.grantSendMessages(testService.tasks.asyncTask);
testTable.grantReadWriteData(testService.tasksPrincipal);

/**
 * Chaos Testing
 */

const chaosExtension = new ChaosExtension(stack, "chaos");

testService.tasksList.map((a) => chaosExtension.addToFunction(a.handler));
chaosExtension.addToFunction(testService.system.workflowService.orchestrator);

chaosExtension.grantReadWrite(role);

/**
 * Async lambda test.
 */

const entry = path.join(
  require.resolve("tests-runtime"),
  "../async-writer-handler.js"
);
const asyncWriterFunction = new NodejsFunction(stack, "asyncWriterFunction", {
  entry,
  handler: "handle",
  environment: {
    TEST_SERVICE_URL: testService.gateway.apiEndpoint,
  },
});
asyncWriterFunction.grantInvoke(pipeRole);
testService.grantInvokeHttpServiceApi(asyncWriterFunction);

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-pipes-pipe.html
new CfnPipe(stack, "pipe", {
  targetParameters: {
    inputTemplate:
      '{"token": "<$.body.token>","type":"<$.body.type>","ingestionTime":"<aws.pipes.event.ingestion-time>"}',
  },
  name: stack.stackName + "_pipe",
  roleArn: pipeRole.roleArn,
  source: testQueue.queueArn,
  target: asyncWriterFunction.functionArn,
});

new ServiceDashboard(stack, "dashboard", {
  service: testService,
});

new DebugDashboard(stack, "debug-dash", {
  service: testService,
});

// used by github actions to run the test harness.
new CfnOutput(stack, "roleArn", {
  value: role.roleArn,
});

new CfnOutput(stack, "serviceUrl", {
  value: testService.gateway.apiEndpoint,
});

new CfnOutput(stack, "testSocketUrl", {
  value: testService.sockets.socket1.gatewayStage.url,
});

new CfnOutput(stack, "chaosParamName", {
  value: chaosExtension.ssm.parameterName,
});
