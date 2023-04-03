import { subscriptionServiceFunctionSuffix } from "@eventual/aws-runtime";
import type { SubscriptionFunction } from "@eventual/core-runtime";
import { aws_iam } from "aws-cdk-lib";
import { IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import { CommandService } from "./command-service";
import { DeepCompositePrincipal } from "./deep-composite-principal";
import { EntityService } from "./entity-service";
import type { EventService } from "./event-service";
import type { LazyInterface } from "./proxy-construct";
import type {
  EventualResource,
  ServiceConstructProps,
  ServiceLocal,
} from "./service";
import { ServiceFunction } from "./service-function";
import type { ServiceEntityProps } from "./utils";

export type Subscriptions<Service> = ServiceEntityProps<
  Service,
  "Subscription",
  Subscription
>;

export type SubscriptionOverrides<Service> = Partial<
  ServiceEntityProps<Service, "Subscription", SubscriptionHandlerProps>
>;

export interface SubscriptionHandlerProps
  extends Omit<Partial<FunctionProps>, "code" | "handler" | "functionName"> {}

export interface SubscriptionsProps<S = any> extends ServiceConstructProps {
  readonly commandService: LazyInterface<CommandService>;
  /**
   * The Service's {@link EventService} repository.
   */
  readonly entityService: EntityService<S>;
  readonly eventService: EventService;
  readonly local: ServiceLocal | undefined;
  /**
   * Configuration for individual Event Handlers created with `onEvent`.
   */
  readonly subscriptions?: SubscriptionOverrides<S>;
}

export const Subscriptions: {
  new <Service>(props: SubscriptionsProps<Service>): Subscriptions<Service>;
} = class Subscriptions<Service> {
  constructor(props: SubscriptionsProps<Service>) {
    const subscriptionsServiceScope = new Construct(
      props.serviceScope,
      "Subscriptions"
    );

    // create a Construct to safely nest bundled functions in their own namespace

    const subscriptions = Object.fromEntries(
      props.build.subscriptions.map((sub) => {
        return [
          sub.spec.name,
          new Subscription(subscriptionsServiceScope, sub.spec.name, {
            build: props.build,
            bus: props.eventService.bus,
            serviceName: props.serviceName,
            subscription: sub,
            overrides:
              props.subscriptions?.[
                sub.spec.name as keyof SubscriptionOverrides<Service>
              ],
            local: props.local,
          }),
        ];
      })
    );

    const handlers = Object.values(subscriptions).map((s) => s.handler);

    // inject all of the subscriptions onto this object
    Object.assign(this, subscriptions);

    handlers.forEach((handler) => {
      props.eventService.configurePublish(handler);

      // allows the access to all of the operations on the injected service client
      props.service.configureForServiceClient(handler);

      // allow http access to the service client
      props.commandService.configureInvokeHttpServiceApi(handler);
      /**
       * Entity operations
       */
      props.entityService.configureReadWriteEntityTable(handler);
      // transactions
      props.entityService.configureInvokeTransactions(handler);
    });
  }
} as any;

export interface SubscriptionProps {
  serviceName: string;
  build: BuildOutput;
  subscription: SubscriptionFunction;
  overrides?: SubscriptionHandlerProps;
  environment?: Record<string, string>;
  bus: IEventBus;
  local: ServiceLocal | undefined;
}

export class Subscription extends Construct implements EventualResource {
  /**
   * The Lambda Function processing the events matched by this Subscription.
   */
  public readonly handler: Function;

  /**
   * The SQS Queue receiving any "dead letters" for this subscription - i.e.
   * any events that failed to re-process after multiple retries.
   */
  public readonly deadLetterQueue: Queue;

  public readonly grantPrincipal: aws_iam.IPrincipal;

  constructor(scope: Construct, id: string, props: SubscriptionProps) {
    super(scope, id);
    const subscription = props.subscription.spec;

    this.deadLetterQueue = new Queue(this, "DeadLetterQueue");
    this.handler = new ServiceFunction(this, "Handler", {
      build: props.build,
      serviceName: props.serviceName,
      functionNameSuffix: subscriptionServiceFunctionSuffix(subscription.name),
      // defaults are applied
      defaults: {
        deadLetterQueue: this.deadLetterQueue,
        deadLetterQueueEnabled: true,
        environment: props.environment,
      },
      // then runtime props
      runtimeProps: props.subscription.spec.props,
      // then overrides
      overrides: props.overrides,
      bundledFunction: props.subscription,
    });

    this.grantPrincipal = props.local
      ? new DeepCompositePrincipal(
          props.local.environmentRole,
          this.handler.grantPrincipal
        )
      : this.handler.grantPrincipal;

    if (subscription.filters.length > 0) {
      // configure a Rule to route all subscribed events to the eventHandler
      new Rule(this.handler, "Rules", {
        eventBus: props.bus,
        eventPattern: {
          // only events that originate
          // TODO: this seems like it would break service-to-service?
          source: [props.serviceName],
          detailType: Array.from(
            new Set(subscription.filters.map((sub) => sub.name))
          ),
        },
        targets: [
          new LambdaFunction(this.handler, {
            deadLetterQueue: this.deadLetterQueue,
            retryAttempts:
              props.overrides?.retryAttempts ??
              props.subscription.spec.props?.retryAttempts ??
              2,
          }),
        ],
      });
    }
  }
}
