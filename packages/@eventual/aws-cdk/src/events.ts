import { ENV_NAMES } from "@eventual/aws-runtime";
import { AppSpec, ServiceType } from "@eventual/core";
import { EventBus, IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { IService } from "./service";
import { IServiceApi } from "./service-api";
import { ServiceFunction } from "./service-function";

export interface EventsProps {
  /**
   * The {@link AppSec} describing the event subscriptions within the Service.
   */
  readonly appSpec: AppSpec;
  /**
   * The name of the Service this {@link Events} repository belongs to.
   */
  readonly serviceName: string;
  /**
   * Optional environment variables to add to the {@link Events.handler}.
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
   * The Lambda {@link Function} that handles events subscribed to in this service's {@link eventBus}.
   */
  public readonly handler: Function;
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

    this.handler = new ServiceFunction(this, "Handler", {
      functionName: `${props.serviceName}-event-handler`,
      serviceType: ServiceType.EventHandler,
      deadLetterQueueEnabled: true,
      deadLetterQueue: this.deadLetterQueue,
      retryAttempts: 2,
      environment: props.environment,
    });
    this.grantPrincipal = this.handler.grantPrincipal;
    this.configurePublish(this.handler);

    if (props.appSpec.subscriptions.length > 0) {
      // configure a Rule to route all subscribed events to the eventHandler
      new Rule(this, "Rules", {
        eventBus: this.bus,
        eventPattern: {
          source: [props.serviceName],
          detailType: Array.from(
            new Set(props.appSpec.subscriptions.map((sub) => sub.name))
          ),
        },
        targets: [
          new LambdaFunction(this.handler, {
            deadLetterQueue: this.deadLetterQueue,
          }),
        ],
      });
    }

    this.configureEventHandler();
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
    this.props.service.configureForServiceClient(this.handler);
    // allow http access to the service client
    this.props.api.configureInvokeHttpServiceApi(this.handler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.EVENT_BUS_ARN]: () => this.bus.eventBusArn,
    [ENV_NAMES.SERVICE_NAME]: () => this.serviceName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
