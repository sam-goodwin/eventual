import {
  App,
  AssetHashType,
  CfnOutput,
  CfnResource,
  DockerImage,
  Stack,
} from "aws-cdk-lib";
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
import { ServiceDashboard } from "@eventual/aws-cdk";
import { LogLevel } from "@eventual/core";
import { Code, LayerVersion } from "aws-cdk-lib/aws-lambda";
import esbuild from "esbuild";
import fs from "fs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

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

testService.api.grantExecute(role);
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

const chaosTestSSM = new StringParameter(stack, "chaos-param", {
  stringValue: '{ "disabled": true }',
});

chaosTestSSM.grantRead(role);
chaosTestSSM.grantWrite(role);

const chaosLayerEntry = path.join(
  require.resolve("tests-runtime"),
  "../chaos-layer/index.js"
);
const chaosLayer = new LayerVersion(stack, "chaosLayer", {
  code: Code.fromAsset(path.dirname(chaosLayerEntry), {
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      image: DockerImage.fromRegistry("dummy"),
      local: {
        tryBundle: (outLoc) => {
          esbuild.buildSync({
            entryPoints: [chaosLayerEntry],
            bundle: true,
            outfile: `${outLoc}/chaos-ext/index.js`,
            platform: "node",
            // cannot currently import modules from layers.
            format: "cjs",
            // Target for node 16
            target: "es2021",
          });
          fs.mkdirSync(`${outLoc}/extensions`);
          fs.cpSync(
            path.resolve(__dirname, "../scripts/extensions/chaos-ext"),
            `${outLoc}/chaos-ext-start`
          );
          return true;
        },
      },
    },
  }),
});

testService.workflows.orchestrator.addLayers(chaosLayer);
testService.workflows.orchestrator.addEnvironment(
  "AWS_LAMBDA_EXEC_WRAPPER",
  "/opt/chaos-ext-start"
);
testService.workflows.orchestrator.addEnvironment(
  "EVENTUAL_AWS_SDK_PLUGIN",
  "/opt/chaos-ext/index.js"
);
testService.workflows.orchestrator.addEnvironment(
  "EVENTUAL_CHAOS_TEST_PARAM",
  chaosTestSSM.parameterName
);

chaosTestSSM.grantRead(testService.workflows.orchestrator);

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
testService.api.grantExecute(asyncWriterFunction);

new ServiceDashboard(stack, "dashboard", {
  service: testService,
});

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

new CfnOutput(stack, "serviceUrl", {
  value: testService.api.gateway.apiEndpoint,
  exportName: "ServiceUrl",
});

new CfnOutput(stack, "chaosParamName", {
  value: chaosTestSSM.parameterName,
});
