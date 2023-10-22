import {
  IWebSocketApi,
  WebSocketApi,
  WebSocketNoneAuthorizer,
  WebSocketStage,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES, socketServiceSocketName } from "@eventual/aws-runtime";
import { SocketFunction } from "@eventual/core-runtime";
import { SocketUrls } from "@eventual/core/internal/index.js";
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { SpecHttpApiProps } from "./constructs/spec-http-api.js";
import { DeepCompositePrincipal } from "./deep-composite-principal.js";
import { EventualResource } from "./resource.js";
import {
  WorkerServiceConstructProps,
  configureWorkerCalls,
} from "./service-common.js";
import { ServiceFunction } from "./service-function.js";
import { ServiceLocal } from "./service.js";
import { ServiceEntityProps } from "./utils.js";

export type ApiOverrides = Omit<SpecHttpApiProps, "apiDefinition">;

export type Sockets<Service> = ServiceEntityProps<Service, "Socket", Socket>;

export type SocketOverrides<Service> = Partial<
  ServiceEntityProps<Service, "Socket", SocketHandlerProps>
>;

export interface SocketsProps<Service = any>
  extends WorkerServiceConstructProps {
  local: ServiceLocal | undefined;
  overrides?: SocketOverrides<Service>;
}

/**
 * Properties that can be overridden for an individual API handler Function.
 */
export type SocketHandlerProps = Partial<
  Omit<FunctionProps, "code" | "runtime" | "functionName">
>;

export class SocketService<Service = any> {
  /**
   * API Gateway for providing service api
   */
  public readonly sockets: Sockets<Service>;

  constructor(props: SocketsProps<Service>) {
    const socketsScope = new Construct(props.serviceScope, "Sockets");

    this.sockets = Object.fromEntries(
      props.build.sockets.map((socket) => [
        socket.spec.name,
        new Socket(socketsScope, {
          serviceProps: props,
          socketService: this,
          socket,
          local: props.local,
        }),
      ])
    ) as Sockets<Service>;
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SOCKET_URLS]: () =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(this.sockets as Record<string, Socket>).map(
            ([name, socket]) =>
              [
                name,
                {
                  http: socket.gatewayStage.url.replace("wss://", "https://"),
                  wss: socket.gatewayStage.url,
                } satisfies SocketUrls,
              ] as const
          )
        )
      ),
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }

  public configureInvokeSocketEndpoints(func: Function) {
    this.grantInvokeSocketEndpoints(func);
    this.addEnvs(func, ENV_NAMES.SOCKET_URLS);
  }

  public grantInvokeSocketEndpoints(grantable: IGrantable) {
    // generally we want to compute the grants, but apigateway urls use the generated appid and not the name
    Object.values<Socket>(this.sockets).map((s) =>
      s.gateway.grantManageConnections(grantable)
    );
  }
}

interface SocketProps {
  serviceProps: SocketsProps<any>;
  socketService: SocketService<any>;
  socket: SocketFunction;
  local: ServiceLocal | undefined;
}

export interface ISocket {
  grantPrincipal: IPrincipal;
  gateway: IWebSocketApi;
  gatewayStage: WebSocketStage;
  handler: Function;
}

class Socket extends Construct implements EventualResource, ISocket {
  public grantPrincipal: IPrincipal;
  public gateway: WebSocketApi;
  public gatewayStage: WebSocketStage;
  public handler: Function;

  constructor(scope: Construct, props: SocketProps) {
    const socketName = props.socket.spec.name;

    super(scope, socketName);

    this.handler = new ServiceFunction(this, "DefaultHandler", {
      compliancePolicy: props.serviceProps.compliancePolicy,
      build: props.serviceProps.build,
      bundledFunction: props.socket,
      functionNameSuffix: `socket-${socketName}-default`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.SOCKET_NAME]: socketName,
          ...props.serviceProps.environment,
        },
      },
      runtimeProps: props.socket.spec,
      overrides: props.serviceProps.overrides?.[socketName],
    });

    configureWorkerCalls(props.serviceProps, this.handler);

    this.gateway = new WebSocketApi(this, "Gateway", {
      apiName: socketServiceSocketName(
        props.serviceProps.serviceName,
        socketName
      ),
      defaultRouteOptions: {
        // https://stackoverflow.com/a/72716478
        // must create one integration per...
        integration: new WebSocketLambdaIntegration("default", this.handler),
      },
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("Connect", this.handler),
        authorizer: new WebSocketNoneAuthorizer(),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration("Disconnect", this.handler),
      },
    });

    this.gatewayStage = new WebSocketStage(this, "Stage", {
      stageName: "default",
      webSocketApi: this.gateway,
      autoDeploy: true,
    });

    this.grantPrincipal = props.local
      ? new DeepCompositePrincipal(
          this.handler.grantPrincipal,
          props.local.environmentRole
        )
      : this.handler.grantPrincipal;
  }
}
