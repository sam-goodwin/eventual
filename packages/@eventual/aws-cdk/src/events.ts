import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType, Subscription } from "@eventual/core";
import { EventBus, IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import { IService } from "./service";
import { IServiceApi } from "./service-api";
import { ServiceFunction } from "./service-function";

export interface EventsProps {
  /**
   * The built service describing the event subscriptions within the Service.
   */
  readonly build: BuildOutput;
  /**
   * The name of the Service this {@link Events} repository belongs to.
   */
  readonly serviceName: string;
  /**
   * Optional environment variables to add to the {@link Events.defaultHandler}.
   *
   * @default - no extra environment variables
   */
  readonly environment?: Record<string, string>;
  readonly service: IService;
  readonly api: IServiceApi;
}

export class Events extends Construct implements IGrantable {
  /**
   * The {@link EventBus} containing all events flowing into and out of this {@link Service}.
   */
  public readonly bus: IEventBus;
  /**
   * The default Lambda {@link Function} that handles events subscribed to in this service's {@link eventBus}.
   *
   * This Function only contains event handlers that were not exported by the service -- exported event
   * handlers are individually bundled and a separate {@link Function} is created. These are available
   * in {@link handlers}.
   */
  public readonly defaultHandler: Function;
  /**
   * Individual Event Handler Lambda Functions handling only events they subscribe to. These handlers
   * are individually bundled and tree-shaken for optimal performance and may contain their own custom
   * memory and timeout configuration.
   */
  public readonly handlers: Function[];
  /**
   * A SQS Queue to collect events that failed to be handled.
   */
  public readonly deadLetterQueue: IQueue;

  public readonly grantPrincipal: IPrincipal;

  private readonly serviceName: string;

  constructor(scope: Construct, id: string, private props: EventsProps) {
    super(scope, id);

    this.serviceName = props.serviceName;

    this.bus = new EventBus(this, "Bus", {
      eventBusName: props.serviceName,
    });

    this.deadLetterQueue = new Queue(this, "DeadLetterQueue");

    const functionProps = {
      serviceType: ServiceType.EventHandler,
      deadLetterQueueEnabled: true,
      deadLetterQueue: this.deadLetterQueue,
      retryAttempts: 2,
      environment: props.environment,
    };

    this.defaultHandler = new ServiceFunction(this, "Handler", {
      code: props.build.getCode(props.build.events.default.file),
      functionName: `${props.serviceName}-event-handler`,
      ...functionProps,
    });
    this.grantPrincipal = this.defaultHandler.grantPrincipal;
    this.configurePublish(this.defaultHandler);

    // create a Construct to safely nest bundled functions in their own namespace
    const handlers = new Construct(this, "BundledHandlers");

    this.handlers = props.build.events.handlers.map((handler) => {
      const handlerFunction = new ServiceFunction(
        handlers,
        handler.exportName,
        {
          code: props.build.getCode(props.build.events.default.file),
          functionName: `${props.serviceName}-event-${handler.exportName}`,
          ...functionProps,
          memorySize: handler.memorySize,
          retryAttempts: handler.retryAttempts ?? functionProps.retryAttempts,
        }
      );

      this.createRule(handlerFunction, handler.subscriptions);

      return handlerFunction;
    });

    this.createRule(
      this.defaultHandler,
      props.build.events.default.subscriptions
    );

    this.configureEventHandler();
  }

  private createRule(func: Function, subscriptions: Subscription[]) {
    if (subscriptions.length > 0) {
      // configure a Rule to route all subscribed events to the eventHandler
      new Rule(func, "Rules", {
        eventBus: this.bus,
        eventPattern: {
          // only events that originate
          // TODO: this seems like it would break service-to-service?
          source: [this.serviceName],
          detailType: Array.from(new Set(subscriptions.map((sub) => sub.name))),
        },
        targets: [
          new LambdaFunction(this.defaultHandler, {
            deadLetterQueue: this.deadLetterQueue,
          }),
        ],
      });
    }
  }

  public configurePublish(func: Function) {
    this.grantPublish(func);
    this.addEnvs(func, ENV_NAMES.EVENT_BUS_ARN, ENV_NAMES.SERVICE_NAME);
  }

  /**
   * Grants permission to publish to this {@link Service}'s {@link eventBus}.
   */
  public grantPublish(grantable: IGrantable) {
    this.bus.grantPutEventsTo(grantable);
  }

  private configureEventHandler() {
    // allows the access to all of the operations on the injected service client
    this.props.service.configureForServiceClient(this.defaultHandler);
    // allow http access to the service client
    this.props.api.configureInvokeHttpServiceApi(this.defaultHandler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.EVENT_BUS_ARN]: () => this.bus.eventBusArn,
    [ENV_NAMES.SERVICE_NAME]: () => this.serviceName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
