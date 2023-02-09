import {
  HttpApi,
  HttpMethod,
  HttpRouteProps,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { computeDurationSeconds } from "@eventual/runtime-core";
import { Arn, aws_iam, Duration, Stack } from "aws-cdk-lib";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  Code,
  Function,
  FunctionProps,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import openapi from "openapi3-ts";
import type { Activities } from "./activities";
import type { BuildOutput } from "./build";
import {
  CommandFunction,
  InternalApiFunction,
  InternalApiRoutes,
} from "./build-manifest";
import type { Events } from "./events";
import { grant } from "./grant";
import type { Scheduler } from "./scheduler";
import { IService } from "./service";
import { addEnvironment, KeysOfType, NODE_18_X } from "./utils";
import type { Workflows } from "./workflows";

export type CommandNames<Service = any> = KeysOfType<
  Service,
  { kind: "Command" }
>;

export type CommandProps<Service> = {
  default?: CommandHandlerProps;
} & {
  [api in CommandNames<Service>]?: CommandHandlerProps;
};

export interface ApiProps<Service = any> {
  serviceName: string;
  environment?: Record<string, string>;
  workflows: Workflows;
  activities: Activities;
  scheduler: Scheduler;
  events: Events<Service>;
  service: IService;
  build: BuildOutput;
  commands?: CommandProps<Service>;
}

/**
 * Properties that can be overridden for an individual API handler Function.
 */
export interface CommandHandlerProps
  extends Partial<Omit<FunctionProps, "code" | "runtime" | "functionName">>,
    Pick<HttpRouteProps, "authorizer"> {
  /**
   * A callback that will be invoked on the Function after all the Service has been fully instantiated
   */
  init?(func: Function): void;
}

export interface IServiceApi {
  configureInvokeHttpServiceApi(func: Function): void;
  grantInvokeHttpServiceApi(grantable: IGrantable): void;
}

export type ServiceCommands<Service> = {
  default: Function;
} & {
  [command in CommandNames<Service>]: Function;
};

export class Api<Service> extends Construct implements IServiceApi, IGrantable {
  /**
   * A Reference to this Service's {@link BuildOutput}.
   */
  private readonly build: BuildOutput;

  /**
   * API Gateway for providing service api
   */
  public readonly gateway: HttpApi;

  /**
   * The OpenAPI specification for this Service.
   */
  readonly specification: openapi.OpenAPIObject;

  /**
   * A map of Command Name to the Lambda Function handling its logic.
   */
  readonly commands: ServiceCommands<Service>;

  readonly grantPrincipal: aws_iam.IPrincipal;

  /**
   * Individual API Handler Lambda Functions handling only a single API route. These handlers
   * are individually bundled and tree-shaken for optimal performance and may contain their own custom
   * memory and timeout configuration.
   */
  public get handlers(): Function[] {
    return Object.values(this.commands);
  }

  constructor(scope: Construct, id: string, private props: ApiProps<Service>) {
    super(scope, id);
    const self = this;

    this.build = props.build;

    const internalApiRoutes: InternalApiRoutes = this.props.build.api;
    const internalInit: {
      [route in keyof typeof internalApiRoutes]?: CommandMapping["init"];
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

    const role = new aws_iam.Role(this, "DefaultRole", {
      assumedBy: new aws_iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    this.grantPrincipal = role;

    const { specification, commands } = synthesizeAPI([
      ...Object.values(this.build.commands).map(
        (manifest) =>
          ({
            manifest,
            overrides:
              props.commands?.[manifest.spec.name as CommandNames<Service>],
          } satisfies CommandMapping)
      ),
      ...(Object.entries(this.build.api) as any).map(
        ([path, manifest]: [keyof InternalApiRoutes, InternalApiFunction]) =>
          ({
            manifest,
            overrides: {
              authorizer: new HttpIamAuthorizer(),
              init: internalInit[path],
            },
          } satisfies CommandMapping)
      ),
    ]);

    this.specification = specification;
    this.commands = commands;

    this.gateway = new HttpApi(this, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration(
        "default",
        this.commands.default
      ),
    });

    // The handler is given an instance of the service client.
    // Allow it to access any of the methods on the service client by default.
    this.configureInvokeHttpServiceApi(this.commands.default);
    this.configureApiHandler(this.commands.default);

    function synthesizeAPI(commands: CommandMapping[]): {
      specification: openapi.OpenAPIObject;
      commands: ServiceCommands<Service>;
    } {
      const synthesizedCommands = Object.fromEntries(
        commands.map((mapping) => {
          const { manifest, overrides } = mapping;
          const command = manifest.spec;
          const handler = new Function(self, manifest.spec.name, {
            ...overrides,
            functionName: `${self.props.serviceName}-command-${command.name}`,
            code: Code.fromAsset(self.props.build.resolveFolder(manifest.file)),
            runtime: NODE_18_X,
            architecture: Architecture.ARM_64,
            environment: {
              NODE_OPTIONS: "--enable-source-maps",
              ...(overrides?.environment ?? {}),
            },
            memorySize: overrides?.memorySize ?? manifest.spec.memorySize,
            timeout:
              overrides?.timeout ?? manifest.spec.timeout
                ? Duration.seconds(
                    computeDurationSeconds(manifest.spec.timeout!)
                  )
                : undefined,
            handler: overrides?.handler ?? "index.handler",
            role: overrides?.role ?? self.commands.default.role,
          });
          return [
            command.name as CommandNames<Service>,
            {
              handler,
              paths: createAPIPaths(handler, mapping),
            },
          ] as const;
        })
      );

      const paths = Object.values(
        synthesizedCommands as Record<string, { paths: openapi.PathsObject }>
      ).reduce<openapi.PathsObject>(
        (allPaths, { paths }) => mergeAPIPaths(allPaths, paths),
        {}
      );

      const specification: openapi.OpenAPIObject = {
        openapi: "3.0.1",
        info: {
          title: self.build.serviceName,
          // TODO: use the package.json?
          version: "1",
        },
        paths: {
          "/$default": {
            isDefaultRoute: true,
            [XAmazonApiGatewayIntegration]: {
              connectionType: "INTERNET",
              httpMethod: HttpMethod.POST, // TODO: why POST? Exported API has this but it's not clear
              payloadFormatVersion: "2.0",
              type: "aws_proxy",
              uri: self.commands.default.functionArn,
            } satisfies XAmazonApiGatewayIntegration,
          },
          ...paths,
        },
      };

      return {
        specification,
        commands: Object.fromEntries(
          Object.entries(synthesizedCommands).map(
            ([commandName, { handler }]) => [commandName, handler]
          )
        ) as ServiceCommands<Service>,
      };

      function mergeAPIPaths(
        a: openapi.PathsObject,
        b: openapi.PathsObject
      ): openapi.PathsObject {
        for (const [path, route] of Object.entries(b)) {
          if (path in a) {
            // spread collisions into one
            // assumes no duplicate METHODs
            a[path] = {
              ...a[path],
              [path]: route,
            };
          } else {
            a[path] = route;
          }
        }
        return a;
      }

      function createAPIPaths(
        handler: Function,
        { manifest, init }: CommandMapping
      ): openapi.PathsObject {
        const command = manifest.spec;
        init?.(handler);

        self.configureInvokeHttpServiceApi(handler);

        return {
          [`/_rpc/${command.name}`]: {
            post: {
              requestBody: {
                content: {
                  "/application/json": {
                    schema: command.input,
                  },
                },
              },
              responses: {
                default: {
                  description: `Default response for ${command.method} ${command.path}`,
                } satisfies openapi.ResponseObject,
              },
            },
          } satisfies openapi.PathItemObject,
          ...(command.path
            ? {
                [command.path]: {
                  [command.method?.toLocaleLowerCase() ?? "get"]: {
                    parameters: Object.entries(command.params ?? {}).flatMap(
                      ([name, spec]) =>
                        spec === "body" ||
                        (typeof spec === "object" && spec.in === "body")
                          ? []
                          : [
                              {
                                in:
                                  typeof spec === "string"
                                    ? spec
                                    : (spec?.in as "query" | "header") ??
                                      "query",
                                name,
                              } satisfies openapi.ParameterObject,
                            ]
                    ),
                  },
                } satisfies openapi.PathItemObject,
              }
            : {}),
        };
      }
    }
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

interface CommandMapping {
  manifest: CommandFunction;
  overrides?: CommandHandlerProps;
  init?: (grantee: Function) => void;
  role?: aws_iam.IRole;
}

const XAmazonApiGatewayIntegration = "x-amazon-apigateway-integration";

interface XAmazonApiGatewayIntegration {
  payloadFormatVersion: "2.0";
  type: "aws_proxy";
  httpMethod: HttpMethod;
  uri: string;
  connectionType: "INTERNET";
}
