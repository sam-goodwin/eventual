import { subscriptionServiceFunctionSuffix } from "@eventual/aws-runtime";
import { aws_iam } from "aws-cdk-lib";
import { IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import type { IGrantable } from "aws-cdk-lib/aws-iam";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import type { SubscriptionFunction } from "./build-manifest";
import type { Events } from "./events";
import type { ServiceConstructProps } from "./service";
import { ICommands } from "./commands";
import { ServiceFunction } from "./service-function";
import type { KeysOfType } from "./utils";

export type SubscriptionNames<Service> = KeysOfType<
  Service,
  { kind: "Subscription" }
>;

export type SubscriptionOverrides<Service> = {
  [eventHandler in SubscriptionNames<Service>]?: SubscriptionHandlerProps;
};

export interface SubscriptionHandlerProps
  extends Omit<Partial<FunctionProps>, "code" | "handler" | "functionName"> {}

export interface SubscriptionsProps<S = any> extends ServiceConstructProps {
  /**
   * Configuration for individual Event Handlers created with `onEvent`.
   */
  readonly subscriptions?: SubscriptionOverrides<S>;
  /**
   * The Service's {@link Events} repository.
   */
  readonly events: Events;
  readonly commands: ICommands;
}

export type Subscriptions<Service> = {
  [subscriptionName in keyof Pick<
    Service,
    SubscriptionNames<Service>
  >]: Subscription;
};
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
            bus: props.events.bus,
            serviceName: props.serviceName,
            subscription: sub,
            overrides:
              props.subscriptions?.[
                sub.spec.name as SubscriptionNames<Service>
              ],
          }),
        ];
      })
    );

    const handlers = Object.values(subscriptions).map((s) => s.handler);

    // inject all of the subscriptions onto this object
    Object.assign(this, subscriptions);

    handlers.forEach((handler) => {
      props.events.configurePublish(handler);

      // allows the access to all of the operations on the injected service client
      props.service.configureForServiceClient(handler);

      // allow http access to the service client
      props.commands.configureInvokeHttpServiceApi(handler);
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
}

export class Subscription extends Construct implements IGrantable {
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
      overrides: {
        deadLetterQueue: this.deadLetterQueue,
        deadLetterQueueEnabled: true,
        ...props.overrides,
      },
      environment: props.environment,
      runtimeProps: props.subscription.spec.props,
      bundledFunction: props.subscription,
    });

    this.grantPrincipal = this.handler.grantPrincipal;

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
