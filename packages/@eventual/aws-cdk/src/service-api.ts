import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { computeDurationSeconds } from "@eventual/runtime-core";
import { Arn, aws_iam, Duration, Stack } from "aws-cdk-lib";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";
import type { Activities } from "./activities";
import type { BuildOutput } from "./build";
import { ApiFunction, InternalApiRoutes } from "./build-manifest";
import type { Events } from "./events";
import { grant } from "./grant";
import type { Scheduler } from "./scheduler";
import { IService } from "./service";
import { ServiceFunction } from "./service-function";
import { addEnvironment, baseFnProps } from "./utils";
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
  /**
   * The default Lambda Function for processing inbound API requests with user defined code.
   *
   * Any API route that could not be individually bundled or tree-shaken is handled by this
   * default Function.
   */
  public readonly defaultHandler: Function;
  /**
   * Individual Lambda Functions per API route. Any API function that was exported from a
   * module is individually tree-shaken and loaded into its own Lambda Function with a
   * customizable memory and timeout.
   */
  public readonly routes: {
    [path: string]: Function;
  };
  /**
   * Individual Lambda Functions handling each of the internal Eventual APIs.
   *
   * @see InternalApiRoutes
   */
  public readonly internalRoutes: {
    [path in keyof InternalApiRoutes]: Function;
  };

  /**
   * Individual API Handler Lambda Functions handling only a single API route. These handlers
   * are individually bundled and tree-shaken for optimal performance and may contain their own custom
   * memory and timeout configuration.
   */
  public readonly handlers: Function[];

  constructor(scope: Construct, id: string, private props: ApiProps) {
    super(scope, id);

    this.defaultHandler = new ServiceFunction(this, "Handler", {
      functionName: `${props.serviceName}-api-handler`,
      serviceType: ServiceType.ApiHandler,
      memorySize: 512,
      code: props.build.getCode(props.build.api.default.file),
    });

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration(
        "default",
        this.defaultHandler
      ),
    });

    this.routes = this.createUserDefinedRoutes();

    this.handlers = [this.defaultHandler, ...Object.values(this.routes)];

    this.internalRoutes = this.createInternalApiRoutes();

    this.configureApiHandler(this.defaultHandler);
  }

  public configureInvokeHttpServiceApi(...functions: Function[]) {
    for (const func of functions) {
      this.grantInvokeHttpServiceApi(func);
      this.addEnvs(func, ENV_NAMES.SERVICE_URL);
    }
  }

  @grant()
  public grantInvokeHttpServiceApi(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      this.executeApiPolicyStatement()
    );
  }

  private createUserDefinedRoutes() {
    return this.applyRouteMappings(
      Object.fromEntries(
        Object.entries(this.props.build.api.routes).flatMap(([path, route]) => {
          return [
            [
              path,
              {
                ...route,
                // configure all handlers permissions and envs
                // note: all of the handlers share the same role, but each need to be given the env variables.
                grants: (f) => this.configureApiHandler(f),
                role: this.defaultHandler.role,
                handler: "index.default",
              } satisfies RouteMapping,
            ],
          ];
        })
      )
    );
  }

  private createInternalApiRoutes(): {
    [path in keyof InternalApiRoutes]: Function;
  } {
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
    return this.applyRouteMappings(
      Object.fromEntries(
        Object.entries(routes).map(
          ([path, route]) =>
            [
              path,
              {
                ...route,
                grants: grants[path as keyof typeof grants],
              },
            ] as const
        )
      )
    ) as any;
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

  private applyRouteMappings(mappings: Record<string, RouteMapping>): {
    [route: string]: Function;
  } {
    return Object.fromEntries(
      Object.entries(mappings).map(
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
            role,
            ...props
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
            role,
            ...props,
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
          return [apiPath, fn] as const;
        }
      )
    );
  }

  private configureApiHandler(handler: Function) {
    // The handlers are given an instance of the service client.
    // Allow them to access any of the methods on the service client by default.
    this.props.service.configureForServiceClient(handler);
    this.configureInvokeHttpServiceApi(handler);
    // add any user provided envs
    if (this.props.environment) {
      addEnvironment(handler, this.props.environment);
    }
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_URL]: () => this.gateway.apiEndpoint,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface RouteMapping
  extends ApiFunction,
    Omit<Partial<FunctionProps>, "memorySize" | "timeout"> {
  authorized?: boolean;
  grants?: (grantee: Function) => void;
  role?: aws_iam.IRole;
}
