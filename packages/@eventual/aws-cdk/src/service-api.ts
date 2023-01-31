import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { BuildSource } from "@eventual/compiler";
import { ServiceType } from "@eventual/core";
import { Arn, Stack } from "aws-cdk-lib";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import type { Activities } from "./activities";
import { bundleSourcesSync } from "./compile-client";
import type { Events } from "./events";
import type { Scheduler } from "./scheduler";
import { IService, runtimeHandlersEntrypoint } from "./service";
import { ServiceFunction } from "./service-function";
import { baseFnProps, outDir } from "./utils";
import type { Workflows } from "./workflows";

export interface ApiProps {
  serviceName: string;
  environment?: Record<string, string>;
  entry: string;
  workflows: Workflows;
  activities: Activities;
  scheduler: Scheduler;
  events: Events;
  service: IService;
}

export interface IServiceApi {
  configureInvokeHttpServiceApi(func: Function): void;
  grantInvokeHttpServiceApi(grantable: IGrantable): void;
}

export class Api extends Construct implements IServiceApi {
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
      functionName: `${props.serviceName}-api-handler`,
      serviceType: ServiceType.ApiHandler,
      memorySize: 512,
      environment: props.environment,
    });
    // The handler is given an instance of the service client.
    // Allow it to access any of the methods on the service client by default.
    props.service.configureForServiceClient(this.handler);

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration("default", this.handler),
    });

    this.configureInvokeHttpServiceApi(this.handler);

    // TODO move the API definition to the aws-runtime or core-runtime
    //      https://github.com/functionless/eventual/issues/173
    this.applyRouteMappings({
      "/_eventual/workflows": {
        methods: [HttpMethod.GET],
        entry: {
          name: "list-workflows",
          entry: runtimeHandlersEntrypoint("api/list-workflows"),
        },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: {
            name: "start-execution",
            entry: runtimeHandlersEntrypoint("api/executions/new"),
          },
          grants: (fn) => {
            props.workflows.configureStartExecution(fn);
          },
        },
      ],
      "/_eventual/executions": {
        methods: [HttpMethod.GET],
        entry: {
          name: "list-executions",
          entry: runtimeHandlersEntrypoint("api/executions/list"),
        },
        grants: (fn) => {
          props.workflows.configureReadExecutions(fn);
        },
      },
      "/_eventual/executions/{executionId}": {
        methods: [HttpMethod.GET],
        entry: {
          name: "get-execution",
          entry: runtimeHandlersEntrypoint("api/executions/get"),
        },
        grants: (fn) => props.workflows.configureReadExecutions(fn),
      },
      "/_eventual/executions/{executionId}/history": {
        methods: [HttpMethod.GET],
        entry: {
          name: "executions-events",
          entry: runtimeHandlersEntrypoint("api/executions/history"),
        },
        grants: (fn) => props.workflows.configureReadExecutionHistory(fn),
      },
      "/_eventual/executions/{executionId}/signals": {
        methods: [HttpMethod.PUT],
        entry: {
          name: "send-signal",
          entry: runtimeHandlersEntrypoint("api/executions/signals/send"),
        },
        grants: (fn) => {
          props.workflows.configureSendSignal(fn);
        },
      },
      "/_eventual/executions/{executionId}/workflow-history": {
        methods: [HttpMethod.GET],
        entry: {
          name: "executions-history",
          entry: runtimeHandlersEntrypoint("api/executions/workflow-history"),
        },
        grants: (fn) => {
          props.workflows.configureReadHistoryState(fn);
        },
      },
      "/_eventual/events": {
        methods: [HttpMethod.PUT],
        entry: {
          name: "publish-events",
          entry: runtimeHandlersEntrypoint("api/publish-events"),
        },
        grants: (fn) => {
          props.events.configurePublish(fn);
        },
      },
      "/_eventual/activities": {
        methods: [HttpMethod.POST],
        entry: {
          name: "update-activity",
          entry: runtimeHandlersEntrypoint("api/update-activity"),
        },
        grants: (fn) => {
          props.activities.configureWriteActivities(fn);
          props.activities.configureCompleteActivity(fn);
        },
      },
    });

    this.configureApiHandler();
  }

  public configureInvokeHttpServiceApi(func: Function) {
    this.grantInvokeHttpServiceApi(func);
    this.addEnvs(func, ENV_NAMES.SERVICE_URL);
  }

  public grantInvokeHttpServiceApi(grantable: IGrantable) {
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

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_URL]: () => this.gateway.apiEndpoint,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface RouteMapping {
  methods?: HttpMethod[];
  entry: Omit<BuildSource, "outDir" | "injectedEntry">;
  grants?: (grantee: Function) => void;
}
