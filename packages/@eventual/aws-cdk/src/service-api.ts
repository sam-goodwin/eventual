import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { computeDurationSeconds } from "@eventual/runtime-core";
import { Arn, Duration, Stack } from "aws-cdk-lib";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";
import type { Activities } from "./activities";
import type { BuildOutput } from "./build";
import { ApiFunction, InternalApiRoutes } from "./build-manifest";
import type { Events } from "./events";
import type { Scheduler } from "./scheduler";
import { IService } from "./service";
import { ServiceFunction } from "./service-function";
import { baseFnProps } from "./utils";
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
  build: BuildOutput;
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
      code: props.build.getCode(props.build.api.default.file),
    });

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration("default", this.handler),
    });

    // The handler is given an instance of the service client.
    // Allow it to access any of the methods on the service client by default.
    this.configureInvokeHttpServiceApi(this.handler);

    this.createUserDefinedRoutes();

    this.createInternalApiRoutes();

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

  private createUserDefinedRoutes() {
    this.applyRouteMappings(
      Object.fromEntries(
        Object.entries(this.props.build.api.routes).flatMap(([path, route]) => {
          return [
            [
              path,
              {
                ...route,
                grants: (fn) => this.configureInvokeHttpServiceApi(fn),
              },
            ],
          ];
        })
      )
    );
  }

  private createInternalApiRoutes() {
    const routes: InternalApiRoutes = this.props.build.api.internal;

    const grants: {
      [route in keyof typeof routes]?: RouteMapping["grants"];
    } = {
      "/_eventual/activities": (fn) => {
        this.props.activities.configureWriteActivities(fn);
        this.props.activities.configureCompleteActivity(fn);
      },
      "/_eventual/events": (fn) => this.props.events.configurePublish(fn),
      "/_eventual/executions": (fn) =>
        this.props.workflows.configureReadExecutions(fn),
      "/_eventual/executions/{executionId}": (fn) =>
        this.props.workflows.configureReadExecutions(fn),
      "/_eventual/executions/{executionId}/history": (fn) =>
        this.props.workflows.configureReadExecutionHistory(fn),
      "/_eventual/executions/{executionId}/signals": (fn) =>
        this.props.workflows.configureSendSignal(fn),
      "/_eventual/executions/{executionId}/workflow-history": (fn) =>
        this.props.workflows.configureReadHistoryState(fn),
      "/_eventual/workflows/{name}/executions": (fn) =>
        this.props.workflows.configureStartExecution(fn),
    };

    // TODO move the API definition to the aws-runtime or core-runtime
    //      https://github.com/functionless/eventual/issues/173
    this.applyRouteMappings(
      Object.fromEntries(
        Object.entries(routes).map(([path, route]) => [
          path,
          {
            ...route,
            grants: grants[path as keyof typeof grants],
          },
        ])
      )
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

  private applyRouteMappings(mappings: Record<string, RouteMapping>) {
    const deferredAddRoutes: (() => void)[] = [];

    Object.entries(mappings).forEach(
      ([
        apiPath,
        {
          name,
          file,
          methods,
          grants,
          memorySize,
          timeout,
          exportName,
          authorized,
        },
      ]) => {
        const funcId = name ?? path.dirname(file);
        const fn = new Function(this, funcId, {
          functionName: exportName
            ? // use the exportName as the function name - encourage users to choose unique names
              `${this.props.serviceName}-api-${exportName}`
            : undefined,
          code: Code.fromAsset(this.props.build.resolveFolder(file)),
          ...baseFnProps,
          memorySize,
          timeout: timeout
            ? Duration.seconds(computeDurationSeconds(timeout))
            : undefined,
          handler: "index.handler",
        });

        grants?.(fn);
        const integration = new HttpLambdaIntegration(
          `${funcId}-integration`,
          fn
        );
        this.gateway.addRoutes({
          path: apiPath,
          integration,
          methods,
          authorizer: authorized ? new HttpIamAuthorizer() : undefined,
        });
      }
    );

    // actually create the lambda and routes.
    deferredAddRoutes.forEach((a) => a());
  }

  private configureApiHandler(handler?: Function) {
    this.props.workflows.configureFullControl(handler ?? this.handler);
    this.props.events.configurePublish(handler ?? this.handler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_URL]: () => this.gateway.apiEndpoint,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface RouteMapping extends ApiFunction {
  authorized?: boolean;
  grants?: (grantee: Function) => void;
}
