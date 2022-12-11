import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ServiceType } from "@eventual/core";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Arn, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import path from "path";
import { ServiceFunction } from "./service-function";
import { baseNodeFnProps, outDir } from "./utils";
import { Workflows } from "./workflows";
import { Events } from "./events";

export interface ApiProps {
  serviceName: string;
  environment?: Record<string, string>;
  workflows: Workflows;
  events: Events;
}

export class Api extends Construct {
  /**
   * API Gateway for providing service api
   */
  public readonly gateway: HttpApi;
  /*
   * The Lambda Function for processing inbound API requests with user defined code.
   */
  public readonly handler: Function;

  constructor(scope: Construct, id: string, private props: ApiProps) {
    super(scope, id);

    this.handler = new ServiceFunction(this, "Handler", {
      serviceType: ServiceType.ApiHandler,
      memorySize: 512,
      environment: props.environment,
    });

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultAuthorizer: new HttpIamAuthorizer(),
      defaultIntegration: new HttpLambdaIntegration("default", this.handler),
    });

    interface RouteMapping {
      methods?: HttpMethod[];
      entry: { api: string } | { bundled: string };
      grants?: (grantee: Function) => void;
    }

    const route = (mappings: Record<string, RouteMapping | RouteMapping[]>) => {
      Object.entries(mappings).forEach(([path, mappings]) => {
        const mappingsArray = Array.isArray(mappings) ? mappings : [mappings];
        mappingsArray.forEach(({ entry, methods, grants }) => {
          const id =
            //Generate id for the lambda based on its path and method
            path
              .slice(1)
              .replace("/", "-")
              .replace(/[\{\}]/, "") + methods?.join("-") ?? [];
          const fn =
            "api" in entry
              ? this.apiLambda(id, entry.api)
              : this.prebundledLambda(id, entry.bundled);
          grants?.(fn);
          const integration = new HttpLambdaIntegration(
            `${id}-integration`,
            fn
          );
          this.gateway.addRoutes({
            path,
            integration,
            methods,
          });
        });
      });
    };

    route({
      "/_eventual/workflows": {
        methods: [HttpMethod.GET],
        entry: { bundled: "list-workflows" },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: { api: "executions/new.js" },
          grants: (fn) => {
            props.workflows.configureStartWorkflow(fn);
          },
        },
        {
          methods: [HttpMethod.GET],
          entry: { api: "executions/list.js" },
          grants: (fn) => {
            props.workflows.configureReadWorkflowData(fn);
          },
        },
      ],
      "/_eventual/executions/{executionId}/history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/history.js" },
        grants: (fn) => props.workflows.configureReadWorkflowData(fn),
      },
      "/_eventual/executions/{executionId}/workflow-history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/workflow-history.js" },
        // TODO fix me
        grants: (fn) => {
          props.workflows.configureReadHistory(fn);
        },
      },
    });

    this.configureApiHandler();
  }

  public grantExecute(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      this.executeApiPolicyStatement()
    );
  }

  private executeApiPolicyStatement() {
    return new PolicyStatement({
      actions: ["execute-api:*"],
      effect: Effect.ALLOW,
      resources: [
        Arn.format(
          {
            service: "execute-api",
            resource: this.gateway.apiId,
            resourceName: "*/*/*",
          },
          Stack.of(this)
        ),
      ],
    });
  }

  private apiLambda(id: string, entry: string): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/api",
        entry
      ),
      ...baseNodeFnProps,
    });
  }

  private prebundledLambda(id: string, entry: string) {
    return new Function(this, id, {
      code: Code.fromAsset(outDir(this, entry)),
      ...baseNodeFnProps,
      handler: "index.handler",
    });
  }

  private configureApiHandler() {
    this.props.workflows.configureFullControl(this.handler);
    this.props.events.configurePublish(this.handler);
  }
}
