import {
  CorsHttpMethod,
  HttpMethod,
  IHttpApi,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { ENV_NAMES, sanitizeFunctionName } from "@eventual/aws-runtime";
import { commandRpcPath, isDefaultNamespaceCommand } from "@eventual/core";
import type { CommandFunction } from "@eventual/core-runtime";
import {
  CommandSpec,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
} from "@eventual/core/internal";
import { Arn, Duration, Lazy, Stack, aws_iam } from "aws-cdk-lib";
import {
  Effect,
  IGrantable,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import openapi from "openapi3-ts";
import { ApiDefinition } from "./constructs/http-api-definition.js";
import { SpecHttpApi } from "./constructs/spec-http-api";
import { EntityService } from "./entity-service";
import type { EventService } from "./event-service";
import { grant } from "./grant";
import {
  EventualResource,
  ServiceConstructProps,
  ServiceLocal,
} from "./service";
import { ServiceFunction } from "./service-function.js";
import type { TaskService } from "./task-service";
import { ServiceEntityProps, serviceFunctionArn } from "./utils";
import type { WorkflowService } from "./workflow-service";

export type Commands<Service> = {
  default: EventualResource;
} & ServiceEntityProps<Service, "Command", EventualResource>;

export type CommandProps<Service> = {
  default?: CommandHandlerProps;
} & Partial<ServiceEntityProps<Service, "Command", CommandHandlerProps>>;

export interface CorsOptions {
  /**
   * Specifies whether credentials are included in the CORS request.
   * @default false
   */
  readonly allowCredentials?: boolean;
  /**
   * Represents a collection of allowed headers.
   * @default - No Headers are allowed.
   */
  readonly allowHeaders?: string[];
  /**
   * Represents a collection of allowed HTTP methods.
   * OPTIONS will be added automatically.
   *
   * @default - OPTIONS
   */
  readonly allowMethods?: CorsHttpMethod[];
  /**
   * Represents a collection of allowed origins.
   * @default - No Origins are allowed.
   */
  readonly allowOrigins?: string[];
  /**
   * Represents a collection of exposed headers.
   * @default - No Expose Headers are allowed.
   */
  readonly exposeHeaders?: string[];
  /**
   * The duration that the browser should cache preflight request results.
   * @default Duration.seconds(0)
   */
  readonly maxAge?: Duration;
}

export interface CommandsProps<Service = any> extends ServiceConstructProps {
  taskService: TaskService<Service>;
  cors?: CorsOptions;
  entityService: EntityService<Service>;
  eventService: EventService;
  local: ServiceLocal | undefined;
  overrides?: CommandProps<Service>;
  workflowService: WorkflowService;
}

/**
 * Properties that can be overridden for an individual API handler Function.
 */
export interface CommandHandlerProps
  extends Partial<Omit<FunctionProps, "code" | "runtime" | "functionName">> {
  /**
   * A callback that will be invoked on the Function after all the Service has been fully instantiated
   */
  init?(func: Function): void;
}

export class CommandService<Service = any> {
  /**
   * API Gateway for providing service api
   */
  public readonly gateway: IHttpApi;
  /**
   * The OpenAPI specification for this Service.
   */
  readonly specification: openapi.OpenAPIObject;
  /**
   * A map of Command Name to the Lambda Function handling its logic.
   */
  readonly serviceCommands: Commands<Service>;
  readonly systemCommandsHandler: Function;
  private integrationRole: Role;

  /**
   * Individual API Handler Lambda Functions handling only a single API route. These handlers
   * are individually bundled and tree-shaken for optimal performance and may contain their own custom
   * memory and timeout configuration.
   */
  public get handlers(): Function[] {
    return Object.values(this.serviceCommands).map((c) => c.handler);
  }

  constructor(private props: CommandsProps<Service>) {
    const self = this;

    // Construct for grouping commands in the CDK tree
    // Service => System => EventualService => Commands => [all system commands]
    const commandsSystemScope = new Construct(
      props.eventualServiceScope,
      "Commands"
    );
    // Service => Commands
    const commandsScope = new Construct(props.serviceScope, "Commands");

    this.serviceCommands = synthesizeAPI(
      commandsScope,
      [...this.props.build.commands, this.props.build.commandDefault].map(
        (manifest) =>
          ({
            manifest,
            overrides:
              props.overrides?.[manifest.spec.name as keyof Commands<Service>],
            init: (handler) => {
              // The handler is given an instance of the service client.
              // Allow it to access any of the methods on the service client by default.
              self.configureApiHandler(handler);
            },
          } satisfies CommandMapping)
      )
    ) as Commands<Service>;

    this.systemCommandsHandler = new ServiceFunction(
      commandsSystemScope,
      "SystemCommandHandler",
      {
        build: this.props.build,
        bundledFunction:
          this.props.build.system.eventualService.systemCommandHandler,
        functionNameSuffix: "system-command",
        serviceName: this.props.serviceName,
      }
    );

    this.onFinalize(() => {
      this.configureSystemCommandHandler();
    });

    this.integrationRole = new Role(commandsSystemScope, "IntegrationRole", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    this.integrationRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          serviceFunctionArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            "*",
            false
          ),
        ],
      })
    );

    this.specification = createSpecification([
      ...this.props.build.commands.map((command) => {
        return createAPIPaths(command.spec, false);
      }),
      ...this.props.build.system.eventualService.commands.map((command) =>
        createAPIPaths(command, true, true)
      ),
    ]);

    // Service => Gateway
    this.gateway = new SpecHttpApi(props.serviceScope, "Gateway", {
      // apiName: `eventual-api-${props.serviceName}`,
      apiDefinition: ApiDefinition.fromInline(this.specification),
      corsPreflight: props.cors
        ? {
            ...props.cors,
            allowMethods: Array.from(
              new Set([
                ...(props.cors.allowMethods ?? []),
                CorsHttpMethod.OPTIONS,
              ])
            ),
          }
        : undefined,
    });

    this.gateway.node.addDependency(this.integrationRole);

    this.finalize();

    function synthesizeAPI(scope: Construct, commands: CommandMapping[]) {
      return Object.fromEntries(
        commands.map((mapping) => {
          const { manifest, overrides, init } = mapping;
          const command = manifest.spec;

          if (init) {
            self.onFinalize(() => init?.(handler));
          }
          if (overrides?.init) {
            // issue all override finalizers after all the routes and api gateway is created
            self.onFinalize(() => overrides!.init!(handler!));
          }

          const handler = new ServiceFunction(
            scope,
            commandNamespaceName(command),
            {
              build: self.props.build,
              bundledFunction: manifest,
              functionNameSuffix: commandFunctionNameSuffix(command),
              serviceName: props.serviceName,
              overrides,
              defaults: {
                environment: props.environment,
              },
            }
          );

          return [
            command.name as keyof Commands<Service>,
            new EventualResource(handler, self.props.local),
          ] as const;
        })
      );
    }

    function createAPIPaths(
      command: CommandSpec<any, any, any, any>,
      iamAuth?: boolean,
      systemCommand?: boolean
    ): openapi.PathsObject {
      // compute the url to reduce circular dependencies.
      const handlerArn = serviceFunctionArn(
        self.props.serviceName,
        Stack.of(self.props.systemScope),
        systemCommand ? "system-command" : commandFunctionNameSuffix(command)
      );

      return {
        [`/${commandRpcPath(command)}`]: {
          post: {
            [XAmazonApiGatewayAuth]: {
              type: iamAuth ? "AWS_IAM" : "NONE",
            } satisfies XAmazonApiGatewayAuth,
            [XAmazonApiGatewayIntegration]: {
              connectionType: "INTERNET",
              httpMethod: HttpMethod.POST,
              payloadFormatVersion: "2.0",
              type: "AWS_PROXY",
              credentials: self.integrationRole.roleArn,
              uri: handlerArn,
            } satisfies XAmazonApiGatewayIntegration,
            requestBody: {
              content: {
                "application/json": {
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
              [ittyRouteToApigatewayRoute(command.path)]: {
                [command.method?.toLocaleLowerCase() ?? "get"]: {
                  [XAmazonApiGatewayIntegration]: {
                    connectionType: "INTERNET",
                    httpMethod: HttpMethod.POST,
                    payloadFormatVersion: "2.0",
                    type: "AWS_PROXY",
                    credentials: self.integrationRole.roleArn,
                    uri: handlerArn,
                  } satisfies XAmazonApiGatewayIntegration,
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
                                  : (spec?.in as "query" | "header") ?? "query",
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

    function createSpecification(commandPaths: openapi.PathsObject[]) {
      const paths = Object.values(commandPaths).reduce<openapi.PathsObject>(
        (allPaths, paths) => mergeAPIPaths(allPaths, paths),
        {}
      );

      return {
        openapi: "3.0.1",
        info: {
          title: `eventual-api-${self.props.build.serviceName}`,
          // TODO: use the package.json?
          version: "1",
        },
        paths: {
          "/$default": {
            [XAmazonApigatewayAnyMethod]: {
              isDefaultRoute: true,
              [XAmazonApiGatewayIntegration]: {
                connectionType: "INTERNET",
                httpMethod: HttpMethod.POST,
                payloadFormatVersion: "2.0",
                type: "AWS_PROXY",
                credentials: self.integrationRole.roleArn,
                uri: serviceFunctionArn(
                  self.props.serviceName,
                  Stack.of(self.props.systemScope),
                  commandFunctionNameSuffix(
                    self.props.build.commandDefault.spec
                  )
                ),
              } satisfies XAmazonApiGatewayIntegration,
            } satisfies XAmazonApigatewayAnyMethod,
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
            resource: "*",
            // stage/method/path
            resourceName: `*/*/rpc/${EVENTUAL_SYSTEM_COMMAND_NAMESPACE}/*`,
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
    this.grantInvokeHttpServiceApi(handler);
    /**
     * Entity operations
     */
    this.props.entityService.configureReadWriteEntityTable(handler);
    /**
     *
     */
    this.props.entityService.configureInvokeTransactions(
      this.systemCommandsHandler
    );
  }

  private configureSystemCommandHandler() {
    // for update task
    this.props.taskService.configureWriteTasks(this.systemCommandsHandler);
    this.props.taskService.configureCompleteTask(this.systemCommandsHandler);
    // emit events
    this.props.eventService.configureEmit(this.systemCommandsHandler);
    // get and list executions
    this.props.workflowService.configureReadExecutions(
      this.systemCommandsHandler
    );
    // execution history
    this.props.workflowService.configureReadExecutionHistory(
      this.systemCommandsHandler
    );
    // send signal
    this.props.workflowService.configureSendSignal(this.systemCommandsHandler);
    // workflow history
    this.props.workflowService.configureReadHistoryState(
      this.systemCommandsHandler
    );
    // start execution
    this.props.workflowService.configureStartExecution(
      this.systemCommandsHandler
    );
    // transactions
    this.props.entityService.configureInvokeTransactions(
      this.systemCommandsHandler
    );
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

function ittyRouteToApigatewayRoute(route: string) {
  return route === "*"
    ? "/{proxy+}"
    : route.replace(/\*/g, "{proxy+}").replaceAll(/\:([^\/]*)/g, "{$1}");
}

interface CommandMapping {
  manifest: CommandFunction;
  overrides?: CommandHandlerProps;
  init?: (grantee: Function) => void;
  role?: aws_iam.IRole;
}

const XAmazonApiGatewayIntegration = "x-amazon-apigateway-integration";

// https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-swagger-extensions-integration.html
interface XAmazonApiGatewayIntegration {
  payloadFormatVersion: "2.0";
  type: "AWS_PROXY";
  /**
   * The HTTP method used in the integration request. For Lambda function invocations, the value must be POST.
   */
  httpMethod: HttpMethod;
  uri: string;
  connectionType: "INTERNET";
  credentials: string;
}

const XAmazonApiGatewayAuth = "x-amazon-apigateway-auth";

interface XAmazonApiGatewayAuth {
  type: "AWS_IAM" | "NONE";
}

const XAmazonApigatewayAnyMethod = "x-amazon-apigateway-any-method";

// https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-swagger-extensions-any-method.html
interface XAmazonApigatewayAnyMethod {
  isDefaultRoute: boolean;
  [XAmazonApiGatewayIntegration]: XAmazonApiGatewayIntegration;
}

function commandNamespaceName(command: CommandSpec<any, any, any, any>) {
  let sanitizedName = sanitizeFunctionName(command.name);
  if (sanitizedName !== command.name) {
    // in this case, we're working with the low-level http api
    // we do a best effort to transform an HTTP path into a name that Lambda supports
    sanitizedName = `${sanitizedName}-${
      command.method?.toLocaleLowerCase() ?? "all"
    }`;
  }
  const namespacedName = isDefaultNamespaceCommand(command)
    ? sanitizedName
    : `${sanitizedName}-${command.namespace}`;

  return namespacedName;
}

function commandFunctionNameSuffix(command: CommandSpec) {
  return `${commandNamespaceName(command)}-command`;
}
