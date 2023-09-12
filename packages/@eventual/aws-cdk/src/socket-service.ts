import { IWebSocketApi, WebSocketApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { ENV_NAMES, socketServiceSocketName } from "@eventual/aws-runtime";
import { SocketFunction } from "@eventual/core-runtime";
import { IPrincipal } from "aws-cdk-lib/aws-iam";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type openapi from "openapi3-ts";
import { SpecHttpApiProps } from "./constructs/spec-http-api.js";
import { EventualResource } from "./resource.js";
import { WorkerServiceConstructProps } from "./service-common.js";
import { ServiceFunction } from "./service-function.js";
import { ServiceLocal } from "./service.js";
import { ServiceEntityProps } from "./utils.js";
import { DeepCompositePrincipal } from "./deep-composite-principal.js";

export type ApiOverrides = Omit<SpecHttpApiProps, "apiDefinition">;

export type Sockets<Service> = ServiceEntityProps<Service, "Socket", Socket>;

export type SocketOverrides<Service> = Partial<
  ServiceEntityProps<Service, "Socket", SocketHandlerProps>
>;

export interface SocketsProps<Service = any>
  extends WorkerServiceConstructProps {
  local: ServiceLocal | undefined;
  openApi: {
    info: openapi.InfoObject;
  };
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
      Object.entries(props.build.sockets).map(([name, socket]) => [
        name,
        new Socket(socketsScope, {
          serviceProps: props,
          socketService: this,
          socket,
          local: props.local,
        }),
      ])
    ) as Sockets<Service>;
  }
}

interface SocketProps {
  serviceProps: SocketsProps<any>;
  socketService: SocketService<any>;
  socket: SocketFunction;
  local: ServiceLocal | undefined;
}

class Socket extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public gateway: IWebSocketApi;
  public handler: Function;

  constructor(scope: Construct, props: SocketProps) {
    const socketName = props.socket.spec.name;

    super(scope, socketName);

    this.handler = new ServiceFunction(this, "DefaultHandler", {
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
      runtimeProps: props.socket.spec.options,
      overrides: props.serviceProps.overrides?.[socketName],
    });

    const integration = new WebSocketLambdaIntegration("default", this.handler);

    this.gateway = new WebSocketApi(this, "Gateway", {
      apiName: socketServiceSocketName(
        props.serviceProps.serviceName,
        socketName
      ),
      defaultRouteOptions: {
        integration,
      },
      connectRouteOptions: {
        integration,
      },
      disconnectRouteOptions: {
        integration,
      },
      routeSelectionExpression,
    });

    this.grantPrincipal = props.local
      ? new DeepCompositePrincipal(
          this.handler.grantPrincipal,
          props.local.environmentRole
        )
      : this.handler.grantPrincipal;
  }
}
