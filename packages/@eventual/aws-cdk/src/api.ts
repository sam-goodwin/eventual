import { Architecture, Code, Runtime } from "aws-cdk-lib/aws-lambda";
import * as aws_apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import * as integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { aws_lambda, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import path from "path";
import { Workflow } from "./workflow";

export interface EventualApiProps {
  workflows: Workflow[];
}

interface RouteMapping {
  entry: string | string[];
  methods?: aws_apigatewayv2.HttpMethod[];
}

export class EventualApi extends Construct {
  constructor(scope: Construct, id: string, props: EventualApiProps) {
    super(scope, id);

    const environment = {
      WORKFLOWS: JSON.stringify(
        Object.fromEntries(
          props.workflows.map((w) => [w.node.id, w.orchestrator.functionArn])
        )
      ),
    };

    const api = new aws_apigatewayv2.HttpApi(this, "gateway", {
      apiName: "eventual-api",
    });
    const route = (mappings: Record<string, RouteMapping[]>) => {
      Object.entries(mappings).forEach(([path, mappings]) => {
        mappings.forEach(({ entry, methods }) => {
          api.addRoutes({
            path,
            integration: this.lambda(entry, environment),
            methods,
          });
        });
      });
    };

    route({
      "/workflows": [
        {
          methods: [HttpMethod.GET],
          entry: "workflows/list",
        },
      ],
      "/workflows/{name}": [
        {
          methods: [HttpMethod.POST],
          entry: "workflows/invoke",
        },
        {
          methods: [HttpMethod.GET],
          entry: "workflows/status",
        },
      ],
    });

    new CfnOutput(this, "api-url", { value: api.url! });
  }

  lambda(
    entry: string | string[],
    environment?: Record<string, string>
  ): integrations.HttpLambdaIntegration {
    const resolvedEntry = typeof entry === "string" ? [entry] : entry;
    const id = resolvedEntry.join("-");
    console.log(path.join(__dirname, "handler", ...entry));
    return new integrations.HttpLambdaIntegration(
      `${id}-integration`,
      new aws_lambda.Function(this, id, {
        architecture: Architecture.ARM_64,
        code: Code.fromAsset(path.join(__dirname, "handler")),
        handler: `${path.join(...resolvedEntry)}.handler`,
        runtime: Runtime.NODEJS_16_X,
        memorySize: 512,
        environment,
      })
    );
  }
}
