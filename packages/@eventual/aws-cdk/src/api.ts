import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import * as aws_apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import * as integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as authorizers from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import {
  aws_iam,
  aws_lambda,
  aws_lambda_nodejs,
  CfnOutput,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import path from "path";
import { Workflow } from "./workflow";

export interface EventualApiProps {
  workflows: Workflow[];
}

interface RouteMapping {
  entry: string;
  methods?: aws_apigatewayv2.HttpMethod[];
  config?: (fn: aws_lambda.IFunction) => void;
}

export class EventualApi extends Construct {
  readonly api: aws_apigatewayv2.HttpApi;
  readonly apiExecuteRole: aws_iam.Role;

  constructor(scope: Construct, id: string, props: EventualApiProps) {
    super(scope, id);

    const environment = {
      WORKFLOWS: JSON.stringify(
        Object.fromEntries(
          props.workflows.map((w) => [
            w.node.id,
            {
              name: w.node.id,
              tableName: w.table.tableName,
              workflowQueueUrl: w.workflowQueue.queueUrl,
              executionHistoryBucket: w.history.bucketName,
              orchestratorFunctionName: w.orchestrator.functionName,
              activityWorkerFunctionName: w.activityWorker.functionName,
            },
          ])
        )
      ),
    };

    this.api = new aws_apigatewayv2.HttpApi(this, "gateway", {
      apiName: "eventual-api",
      // Can't get past the authorizer for some reason
      defaultAuthorizer: new authorizers.HttpIamAuthorizer(),
    });

    this.apiExecuteRole = new aws_iam.Role(this, "EventualApiRole", {
      roleName: "eventual-api",
      assumedBy: new aws_iam.AccountPrincipal(Stack.of(this).account),
      inlinePolicies: {
        execute: new aws_iam.PolicyDocument({
          statements: [
            new aws_iam.PolicyStatement({
              actions: ["execute-api:*"],
              effect: aws_iam.Effect.ALLOW,
              resources: [
                `arn:aws:execute-api:${Stack.of(this).region}:${
                  Stack.of(this).account
                }:${this.api.apiId}/*/*/*`,
              ],
            }),
          ],
        }),
      },
    });

    const route = (mappings: Record<string, RouteMapping[]>) => {
      Object.entries(mappings).forEach(([path, mappings]) => {
        mappings.forEach(({ entry, methods, config }) => {
          this.api.addRoutes({
            path,
            integration: this.lambda(entry, environment, config),
            methods,
          });
        });
      });
    };

    route({
      "/workflows": [
        {
          methods: [HttpMethod.GET],
          entry: "workflows/list.js",
        },
      ],
      "/workflows/{name}": [
        {
          methods: [HttpMethod.GET],
          entry: "workflows/status.js",
        },
      ],
      "/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: "workflows/execute.js",
          config: (fn) => {
            props.workflows.forEach((w) => {
              w.table.grantReadWriteData(fn);
              w.workflowQueue.grantSendMessages(fn);
            });
          },
        },
      ],
      "/workflows/{name}/executions/{executionId}": [
        {
          methods: [HttpMethod.GET],
          entry: "workflows/executions/status.js",
          config: (fn) => {
            props.workflows.forEach((w) => {
              w.history.grantRead(fn);
            });
          },
        },
      ],
    });

    new CfnOutput(this, "api-url", {
      value: this.api.url!,
      exportName: "eventual-api-url",
    });
  }

  public lambda(
    entry: string,
    environment?: Record<string, string>,
    config?: (fn: aws_lambda.IFunction) => void
  ): integrations.HttpLambdaIntegration {
    const id = entry.replace("/", "-").replace(".js", "");
    const fn = new aws_lambda_nodejs.NodejsFunction(this, id, {
      architecture: Architecture.ARM_64,
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/api",
        entry
      ),
      bundling: {
        // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
        // cannot output as .mjs file as ulid does not support it.
        mainFields: ["module", "main"],
        esbuildArgs: {
          "--conditions": "module,import,require",
        },
        metafile: true,
      },
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
      environment,
    });
    config?.(fn);
    return new integrations.HttpLambdaIntegration(`${id}-integration`, fn);
  }
}
