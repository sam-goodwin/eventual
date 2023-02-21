import {
  HttpApi,
  HttpMethod,
  HttpRouteProps,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import {
  ENV_NAMES,
  sanitizeFunctionName,
  serviceFunctionName,
} from "@eventual/aws-runtime";
import { computeDurationSeconds } from "@eventual/core-runtime";
import { Arn, aws_iam, Duration, Lazy, Stack } from "aws-cdk-lib";
import { Effect, IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  Code,
  Function,
  FunctionProps,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import openapi from "openapi3-ts";
import type { ActivityService } from "./activity-service";
import {
  CommandFunction,
  InternalCommands,
  InternalCommandFunction,
} from "./build-manifest";
import type { EventService } from "./event-service";
import { grant } from "./grant";
import { ServiceConstructProps } from "./service";
import { addEnvironment, KeysOfType, NODE_18_X } from "./utils";
import type { WorkflowService } from "./workflow-service";

export type CommandNames<Service = any> = KeysOfType<
  Service,
  { kind: "Command" }
>;

export type CommandProps<Service> = {
  default?: CommandHandlerProps;
} & {
  [api in CommandNames<Service>]?: CommandHandlerProps;
};

export interface CommandsProps<Service = any> extends ServiceConstructProps {
  activityService: ActivityService<Service>;
  overrides?: CommandProps<Service>;
  eventService: EventService;
  workflowService: WorkflowService;
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

export type ServiceCommands<Service> = {
  default: Function;
} & {
  [command in CommandNames<Service>]: Function;
};

export interface SystemCommands {
  [key: string]: Function;
}

export class CommandService<Service = any> {
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
  readonly serviceCommands: ServiceCommands<Service>;
  readonly systemCommands: SystemCommands;

  /**
   * Individual API Handler Lambda Functions handling only a single API route. These handlers
   * are individually bundled and tree-shaken for optimal performance and may contain their own custom
   * memory and timeout configuration.
   */
  public get handlers(): Function[] {
    return Object.values(this.serviceCommands);
  }

  constructor(private props: CommandsProps<Service>) {
    const self = this;

    const internalApiRoutes: InternalCommands =
      this.props.build.system.eventualService.commands;
    const internalInit: {
      [route in keyof typeof internalApiRoutes]?: CommandMapping["init"];
    } = {
      updateActivity: (fn) => {
        this.props.activityService.configureWriteActivities(fn);
        this.props.activityService.configureCompleteActivity(fn);
      },
      publishEvents: (fn) => this.props.eventService.configurePublish(fn),
      listExecutions: (fn) =>
        this.props.workflowService.configureReadExecutions(fn),
      getExecution: (fn) =>
        this.props.workflowService.configureReadExecutions(fn),
      getExecutionHistory: (fn) =>
        this.props.workflowService.configureReadExecutionHistory(fn),
      sendSignal: (fn) => this.props.workflowService.configureSendSignal(fn),
      getExecutionWorkflowHistory: (fn) =>
        this.props.workflowService.configureReadHistoryState(fn),
      startExecution: (fn) =>
        this.props.workflowService.configureStartExecution(fn),
    };

    // Construct for grouping commands in the CDK tree
    // Service => System => EventualService => Commands => [all system commands]
    const commandsSystemScope = new Construct(
      props.eventualServiceScope,
      "Commands"
    );
    // Service => Commands
    const commandsScope = new Construct(props.serviceScope, "Commands");

    const serviceCommands = synthesizeAPI(
      this.props.build.commands.map(
        (manifest) =>
          ({
            manifest,
            overrides:
              props.overrides?.[manifest.spec.name as CommandNames<Service>],
            init: (handler) => {
              // The handler is given an instance of the service client.
              // Allow it to access any of the methods on the service client by default.
              self.configureApiHandler(handler);
            },
          } satisfies CommandMapping)
      )
    );

    const systemCommands = synthesizeAPI(
      (
        Object.entries(this.props.build.system.eventualService.commands) as any
      ).map(
        ([path, manifest]: [keyof InternalCommands, InternalCommandFunction]) =>
          ({
            manifest,
            overrides: {
              authorizer: new HttpIamAuthorizer(),
              init: internalInit[path],
            },
          } satisfies CommandMapping)
      )
    );

    this.specification = createSpecification({
      ...serviceCommands,
      ...systemCommands,
    });
    this.serviceCommands = Object.fromEntries(
      Object.entries(serviceCommands).map(([c, { handler }]) => [c, handler])
    ) as ServiceCommands<Service>;
    this.systemCommands = Object.fromEntries(
      Object.entries(systemCommands).map(([c, { handler }]) => [c, handler])
    ) as SystemCommands;

    // Service => Gateway
    this.gateway = new HttpApi(props.serviceScope, "Gateway", {
      apiName: `eventual-api-${props.serviceName}`,
      defaultIntegration: new HttpLambdaIntegration(
        "default",
        this.serviceCommands.default
      ),
    });

    this.finalize();

    function synthesizeAPI(commands: CommandMapping[]) {
      return Object.fromEntries(
        commands.map((mapping) => {
          const { manifest, overrides } = mapping;
          const command = manifest.spec;

          let sanitizedName = sanitizeFunctionName(command.name);
          if (sanitizedName !== command.name) {
            // in this case, we're working with the low-level http api
            // we do a best effort to transform an HTTP path into a name that Lambda supports
            sanitizedName = `${sanitizedName}-${
              command.method?.toLocaleLowerCase() ?? "all"
            }`;
          }

          const handler = new Function(
            command.internal ? commandsSystemScope : commandsScope,
            command.name,
            {
              ...overrides,
              functionName: serviceFunctionName(
                self.props.serviceName,
                `${command.internal ? "internal" : "command"}-${sanitizedName}`
              ),
              code: Code.fromAsset(
                self.props.build.resolveFolder(manifest.entry)
              ),
              runtime: NODE_18_X,
              architecture: Architecture.ARM_64,
              environment: {
                NODE_OPTIONS: "--enable-source-maps",
                ...(overrides?.environment ?? {}),
              },
              memorySize: overrides?.memorySize ?? command.memorySize ?? 512,
              timeout:
                overrides?.timeout ?? command.handlerTimeout
                  ? Duration.seconds(
                      computeDurationSeconds(command.handlerTimeout!)
                    )
                  : undefined,
              handler:
                overrides?.handler ?? command.internal
                  ? "index.handler"
                  : "index.default",
              role: command.internal ? undefined : overrides?.role,
            }
          );

          return [
            command.name as CommandNames<Service>,
            {
              handler,
              paths: createAPIPaths(handler, mapping),
            },
          ] as const;
        })
      );

      function createAPIPaths(
        handler: Function,
        { manifest, overrides, init }: CommandMapping
      ): openapi.PathsObject {
        const command = manifest.spec;
        if (init) {
          self.onFinalize(() => init?.(handler));
        }
        if (overrides?.init) {
          // issue all override finalizers after all the routes and api gateway is created
          self.onFinalize(() => overrides!.init!(handler!));
        }

        // TODO: use the Open API spec to configure instead of consuming CloudFormation resources
        // this seems not so simple and not well documented, so for now we take the cheap way out
        // we will keep the api spec and improve it over time
        self.onFinalize(() => {
          const integration = new HttpLambdaIntegration(command.name, handler);
          if (!command.passThrough) {
            // internal and low-level HTTP APIs should be passed through
            self.gateway.addRoutes({
              path: command.internal
                ? `/_eventual/${command.name}`
                : `/_rpc/${command.name}`,
              methods: [HttpMethod.POST],
              integration,
              authorizer: overrides?.authorizer,
            });
          }
          if (command.path) {
            self.gateway.addRoutes({
              path: command.path,
              methods: [
                (command.method as HttpMethod | undefined) ?? HttpMethod.GET,
              ],
              integration,
              authorizer: overrides?.authorizer,
            });
          }
        });

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

    function createSpecification(commands: Record<string, SynthesizedCommand>) {
      const paths = Object.values(commands).reduce<openapi.PathsObject>(
        (allPaths, { paths }) => mergeAPIPaths(allPaths, paths),
        {}
      );

      return {
        openapi: "3.0.1",
        info: {
          title: self.props.build.serviceName,
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
              uri: Lazy.string({
                produce: () => self.serviceCommands.default.functionArn,
              }),
            } satisfies XAmazonApiGatewayIntegration,
          },
          ...paths,
        },
      } satisfies openapi.OpenAPIObject;

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
    }
  }

  private finalizers: (() => any)[] = [];
  private onFinalize(finalizer: () => any) {
    this.finalizers.push(finalizer);
  }

  private finalize() {
    this.finalizers.forEach((finalizer) => finalizer());
    this.finalizers = []; // clear the closures from memory
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
            resource: Lazy.string({
              produce: () => this.gateway.apiId,
            }),
            resourceName: "*/*/*",
          },
          Stack.of(this.gateway)
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
    [ENV_NAMES.SERVICE_URL]: () =>
      Lazy.string({
        produce: () => this.gateway.apiEndpoint,
      }),
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface SynthesizedCommand {
  handler: Function;
  paths: openapi.PathsObject;
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
