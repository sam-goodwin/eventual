import { ENV_NAMES } from "@eventual/aws-runtime";
import { AppSpec, ServiceType } from "@eventual/core";
import {
  ComponentResource,
  Input,
  output,
  ResourceOptions,
} from "@pulumi/pulumi";
import { Activities } from "./activities";
import { EventBus } from "./aws/event-bus";
import { ServiceFunction } from "./service-function";
import { Workflows } from "./workflows";
import { Function } from "./aws/function";
import { IGrantable, IPrincipal } from "./aws/grantable";
import { Queue } from "./aws/queue";
import { Rule } from "./aws/rule";
import { cloudwatch } from "@pulumi/aws";

export interface EventsProps {
  /**
   * The {@link AppSec} describing the event subscriptions within the Service.
   */
  readonly appSpec: Promise<AppSpec>;
  /**
   * The name of the Service this {@link Events} repository belongs to.
   */
  readonly serviceName: string;
  /**
   * Optional environment variables to add to the {@link Events.handler}.
   *
   * @default - no extra environment variables
   */
  readonly environment?: Record<string, Input<string>>;
  readonly workflows: Workflows;
  readonly activities: Activities;
}

export class Events extends ComponentResource implements IGrantable {
  /**
   * The {@link EventBus} containing all events flowing into and out of this {@link Service}.
   */
  public readonly bus: EventBus;
  /**
   * The Lambda {@link Function} that handles events subscribed to in this service's {@link eventBus}.
   */
  public readonly handler: Function;
  /**
   * A SQS Queue to collect events that failed to be handled.
   */
  public readonly deadLetterQueue: Queue;

  public readonly grantPrincipal: IPrincipal;

  private readonly serviceName: string;

  constructor(
    id: string,
    private props: EventsProps,
    options: ResourceOptions
  ) {
    super("eventual:Events", id, {}, options);

    this.serviceName = props.serviceName;

    this.bus = new EventBus(
      "Bus",
      {
        eventBusName: props.serviceName,
      },
      {
        parent: this,
      }
    );

    this.deadLetterQueue = new Queue(
      "DeadLetterQueue",
      {},
      {
        parent: this,
      }
    );

    this.handler = new ServiceFunction(
      "Handler",
      {
        name: `${props.serviceName}-event-handler`,
        serviceType: ServiceType.EventHandler,
        deadLetterConfig: {
          targetArn: this.deadLetterQueue.queueArn,
        },
        retryAttempts: 2,
        environment: props.environment,
      },
      {
        parent: this,
      }
    );
    this.grantPrincipal = this.handler.grantPrincipal;
    this.configurePublish(this.handler);

    this.registerOutputs(
      output(
        props.appSpec.then((appSpec) => {
          if (appSpec.subscriptions.length > 0) {
            // configure a Rule to route all subscribed events to the eventHandler
            const rule = new Rule(
              "Rules",
              {
                eventBusName: this.bus.name,
                eventPattern: JSON.stringify({
                  source: [props.serviceName],
                  "detail-type": Array.from(
                    new Set(appSpec.subscriptions.map((sub) => sub.name))
                  ),
                }),
              },
              {
                parent: this,
              }
            );
            new cloudwatch.EventTarget("yada", {
              rule: rule.name,
              arn: this.handler.functionArn,
              deadLetterConfig: {
                arn: this.deadLetterQueue.arn,
              },
            });
          }
        })
      )
    );

    this.configureEventHandler();
  }

  /**
   * Grants permission to publish to this {@link Service}'s {@link eventBus}.
   */
  public grantPublish(grantable: IGrantable) {
    this.bus.grantPutEventsTo(grantable);
  }

  public configurePublish(func: Function) {
    this.grantPublish(func);
    func.addEnvironment(ENV_NAMES.EVENT_BUS_ARN, this.bus.arn);
    func.addEnvironment(ENV_NAMES.SERVICE_NAME, this.serviceName);
  }

  private configureEventHandler() {
    this.props.workflows.configureFullControl(this.handler);
    // allows the workflow to cancel activities
    this.props.activities.configureUpdateActivity(this.handler);
  }
}
