import {
  ENV_NAMES,
  QueueRuntimeOverrides,
  queueServiceQueueSuffix,
} from "@eventual/aws-runtime";
import type { QueueRuntime } from "@eventual/core-runtime";
import { IGrantable, IPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Duration, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { EventualResource } from "./resource";
import {
  WorkerServiceConstructProps,
  configureWorkerCalls,
} from "./service-common";
import { ServiceFunction } from "./service-function";
import { ServiceEntityProps, formatQueueArn, serviceQueueArn } from "./utils";

export type QueueHandlerFunctionProps = Omit<
  Partial<FunctionProps>,
  "code" | "handler" | "functionName" | "events"
>;

export type QueueOverrides<Service> = Partial<
  ServiceEntityProps<
    Service,
    "Queue",
    QueueRuntimeOverrides &
      Partial<Omit<sqs.QueueProps, "fifo">> & {
        handler: QueueHandlerFunctionProps;
      }
  >
>;

export type ServiceQueues<Service> = ServiceEntityProps<
  Service,
  "Queue",
  IQueue
>;

export interface QueueServiceProps<Service>
  extends WorkerServiceConstructProps {
  queueOverrides?: QueueOverrides<Service>;
}

export class QueueService<Service> {
  public queues: ServiceQueues<Service>;

  constructor(private props: QueueServiceProps<Service>) {
    const queuesScope = new Construct(props.serviceScope, "Queues");

    this.queues = Object.fromEntries(
      props.build.queues.queues.map((q) => [
        q.name,
        new Queue(queuesScope, {
          queue: q,
          queueService: this,
          serviceProps: props,
        }),
      ])
    ) as ServiceQueues<Service>;
  }

  public configureSendMessage(func: Function) {
    this.addEnvs(func, ENV_NAMES.SERVICE_NAME, ENV_NAMES.QUEUE_OVERRIDES);
    this.grantSendAndManageMessage(func);
  }

  public grantSendAndManageMessage(grantee: IGrantable) {
    // find any queue names that were provided by the service and not computed
    const queueNameOverrides = this.props.queueOverrides
      ? Object.values(
          this.props.queueOverrides as Record<string, QueueRuntimeOverrides>
        )
          .map((s) => s.queueName)
          .filter((s): s is string => !!s)
      : [];

    // grants the permission to start any task
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          "sqs:SendMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:DeleteMessage",
        ],
        resources: [
          serviceQueueArn(
            this.props.serviceName,
            queueServiceQueueSuffix("*"),
            false
          ),
          ...queueNameOverrides.map(formatQueueArn),
        ],
      })
    );
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_NAME]: () => this.props.serviceName,
    [ENV_NAMES.QUEUE_OVERRIDES]: () =>
      Stack.of(this.props.serviceScope).toJsonString(this.props.queueOverrides),
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

interface QueueProps {
  serviceProps: QueueServiceProps<any>;
  queueService: QueueService<any>;
  queue: QueueRuntime;
}

export interface IQueue {
  queue: sqs.Queue;
  handler: QueueHandler;
}

class Queue extends Construct implements IQueue {
  public queue: sqs.Queue;
  public handler: QueueHandler;

  constructor(scope: Construct, props: QueueProps) {
    super(scope, props.queue.name);

    const { handler, ...overrides } =
      props.serviceProps.queueOverrides?.[props.queue.name] ?? {};

    this.queue = new sqs.Queue(this, "Queue", {
      ...overrides,
    });

    this.handler = new QueueHandler(this, "Handler", {
      queue: this.queue,
      queueService: props.queueService,
      serviceProps: props.serviceProps,
      runtimeQueue: props.queue,
    });
  }
}

interface QueueHandlerProps {
  queue: sqs.Queue;
  serviceProps: QueueServiceProps<any>;
  queueService: QueueService<any>;
  runtimeQueue: QueueRuntime;
}

export class QueueHandler extends Construct implements EventualResource {
  public grantPrincipal: IPrincipal;
  public handler: Function;
  constructor(scope: Construct, id: string, props: QueueHandlerProps) {
    super(scope, id);

    const queueName = props.runtimeQueue.name;

    this.handler = new ServiceFunction(this, "Handler", {
      build: props.serviceProps.build,
      bundledFunction: props.runtimeQueue.handler,
      functionNameSuffix: `queue-handler-${queueName}`,
      serviceName: props.serviceProps.serviceName,
      defaults: {
        timeout: Duration.minutes(1),
        environment: {
          [ENV_NAMES.QUEUE_NAME]: queueName,
          ...props.serviceProps.environment,
        },
        events: [new SqsEventSource(props.queue, {})],
      },
      runtimeProps: props.runtimeQueue.handler.spec.options,
      overrides: props.serviceProps.queueOverrides?.[queueName]?.handler,
    });

    configureWorkerCalls(props.serviceProps, this.handler);

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}
