import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ServiceType } from "@eventual/core";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { Arn, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ServiceFunction } from "./service-function";
import { baseFnProps, outDir } from "./utils";
import type { Workflows } from "./workflows";
import type { Events } from "./events";
import type { Activities } from "./activities";
import type { Scheduler } from "./scheduler";
import { bundleSourcesSync } from "./compile-client";
import { runtimeEntrypoint } from "./service";
import { BuildSource } from "@eventual/compiler";

export interface ApiProps {
  serviceName: string;
  environment?: Record<string, string>;
  entry: string;
  workflows: Workflows;
  activities: Activities;
  scheduler: Scheduler;
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
    props.activities.configureCompleteActivity(this.handler);
    props.activities.configureScheduleActivity(this.handler);
    props.activities.configureUpdateActivity(this.handler);
    props.workflows.configureSendSignal(this.handler);
    props.workflows.configureSendWorkflowEvent(this.handler);
    props.workflows.configureStartWorkflow(this.handler);

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration("default", this.handler),
    });

    // TODO move the API definition to the aws-runtime or core-runtime
    //      https://github.com/functionless/eventual/issues/173
    this.applyRouteMappings({
      "/_eventual/workflows": {
        methods: [HttpMethod.GET],
        entry: {
          name: "list-workflows",
          entry: runtimeEntrypoint("api/list-workflows"),
        },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: {
            name: "start-execution",
            entry: runtimeEntrypoint("api/executions/new"),
          },
          grants: (fn) => {
            props.workflows.configureStartWorkflow(fn);
          },
        },
      ],
      "/_eventual/executions": {
        methods: [HttpMethod.GET],
        entry: {
          name: "list-executions",
          entry: runtimeEntrypoint("api/executions/list"),
        },
        grants: (fn) => {
          props.workflows.configureReadWorkflowData(fn);
        },
      },
      "/_eventual/executions/{executionId}": {
        methods: [HttpMethod.GET],
        entry: {
          name: "get-execution",
          entry: runtimeEntrypoint("api/executions/get"),
        },
        grants: (fn) => props.workflows.configureReadWorkflowData(fn),
      },
      "/_eventual/executions/{executionId}/events": {
        methods: [HttpMethod.GET],
        entry: {
          name: "executions-events",
          entry: runtimeEntrypoint("api/executions/events"),
        },
        grants: (fn) => props.workflows.configureReadWorkflowData(fn),
      },
      "/_eventual/executions/{executionId}/signals": {
        methods: [HttpMethod.PUT],
        entry: {
          name: "send-signal",
          entry: runtimeEntrypoint("api/executions/signals/send"),
        },
        grants: (fn) => {
          props.workflows.configureReadWorkflowData(fn);
          props.workflows.grantSendSignal(fn);
        },
      },
      "/_eventual/executions/{executionId}/history": {
        methods: [HttpMethod.GET],
        entry: {
          name: "executions-history",
          entry: runtimeEntrypoint("api/executions/history"),
        },
        // TODO fix me
        grants: (fn) => {
          props.activities.configureFullControl(fn);
          props.workflows.configureReadHistory(fn);
          props.scheduler.configureScheduleTimer(fn);
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

  private applyRouteMappings(
    mappings: Record<string, RouteMapping | RouteMapping[]>
  ) {
    const bundles: Omit<BuildSource, "outDir" | "injectedEntry">[] = [];
    const deferredAddRoutes: (() => void)[] = [];

    Object.entries(mappings).forEach(([path, mappings]) => {
      const mappingsArray = Array.isArray(mappings) ? mappings : [mappings];
      mappingsArray.forEach(({ entry, methods, grants }) => {
        const id = entry.name;
        // register the bundles we need to make
        bundles.push(entry);
        // create a closure that creates the gateway route.
        // lambda validates the code bundle immediately so we need to bundle
        // before creating the lambda.
        deferredAddRoutes.push(() => {
          const fn = this.prebundledLambda(id, entry.name);
          grants?.(fn);
          const integration = new HttpLambdaIntegration(
            `${id}-integration`,
            fn
          );
          this.gateway.addRoutes({
            path,
            integration,
            methods,
            authorizer: new HttpIamAuthorizer(),
          });
        });
      });
    });

    // bundle the functions found
    bundleSourcesSync(outDir(this), this.props.entry, ...bundles);
    // actually create the lambda and routes.
    deferredAddRoutes.forEach((a) => a());
  }

  private prebundledLambda(id: string, entry: string) {
    return new Function(this, id, {
      code: Code.fromAsset(outDir(this, entry)),
      ...baseFnProps,
      handler: "index.handler",
    });
  }

  private configureApiHandler() {
    this.props.workflows.configureFullControl(this.handler);
    this.props.events.configurePublish(this.handler);
  }
}

interface RouteMapping {
  methods?: HttpMethod[];
  entry: Omit<BuildSource, "outDir" | "injectedEntry">;
  grants?: (grantee: Function) => void;
}
