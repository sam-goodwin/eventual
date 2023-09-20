import {
  BucketNotificationDeleteEvent,
  BucketNotificationPutEvent,
  EntityStreamItem,
  EventEnvelope,
  EventualServiceClient,
  LogLevel,
} from "@eventual/core";
import { EventClient } from "../clients/event-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { LogsClient } from "../clients/logs-client.js";
import { MetricsClient } from "../clients/metrics-client.js";
import { RuntimeServiceClient } from "../clients/runtime-service-clients.js";
import { TaskClient, TaskWorkerRequest } from "../clients/task-client.js";
import type { TimerClient, TimerRequest } from "../clients/timer-client.js";
import { TransactionClient } from "../clients/transaction-client.js";
import { WorkflowClient } from "../clients/workflow-client.js";
import {
  BucketNotificationHandlerWorker,
  createBucketNotificationHandlerWorker,
} from "../handlers/bucket-handler-worker.js";
import {
  CommandWorker,
  createCommandWorker,
} from "../handlers/command-worker.js";
import {
  EntityStreamWorker,
  createEntityStreamWorker,
} from "../handlers/entity-stream-worker.js";
import { Orchestrator, createOrchestrator } from "../handlers/orchestrator.js";
import {
  QueueHandlerWorker,
  createQueueHandlerWorker,
} from "../handlers/queue-handler-worker.js";
import {
  createSocketWorker,
  type SocketWorker,
} from "../handlers/socket-worker.js";
import {
  SubscriptionWorker,
  createSubscriptionWorker,
} from "../handlers/subscription-worker.js";
import { TaskWorker, createTaskWorker } from "../handlers/task-worker.js";
import { TimerHandler, createTimerHandler } from "../handlers/timer-handler.js";
import {
  TransactionWorker,
  createTransactionWorker,
} from "../handlers/transaction-worker.js";
import { LogAgent } from "../log-agent.js";
import {
  EntityProvider,
  GlobalEntityProvider,
} from "../providers/entity-provider.js";
import { HybridExecutorProvider } from "../providers/executor-provider.js";
import {
  GlobalQueueProvider,
  QueueProvider,
} from "../providers/queue-provider.js";
import {
  GlobalSubscriptionProvider,
  SubscriptionProvider,
} from "../providers/subscription-provider.js";
import {
  GlobalTaskProvider,
  TaskProvider,
} from "../providers/task-provider.js";
import {
  GlobalWorkflowProvider,
  WorkflowProvider,
} from "../providers/workflow-provider.js";
import type { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import type { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import type { ExecutionStore } from "../stores/execution-store.js";
import type { TaskStore } from "../stores/task-store.js";
import {
  createEmitEventsCommand,
  createExecuteTransactionCommand,
  createGetExecutionCommand,
  createListExecutionHistoryCommand,
  createListExecutionsCommand,
  createListWorkflowHistoryCommand,
  createListWorkflowsCommand,
  createSendSignalCommand,
  createStartExecutionCommand,
  createUpdateTaskCommand,
} from "../system-commands.js";
import type { WorkflowTask } from "../tasks.js";
import { LocalEventClient } from "./clients/event-client.js";
import { LocalExecutionQueueClient } from "./clients/execution-queue-client.js";
import { LocalLogsClient } from "./clients/logs-client.js";
import { LocalMetricsClient } from "./clients/metrics-client.js";
import { LocalOpenSearchClient } from "./clients/open-search-client.js";
import { LocalQueueClient } from "./clients/queue-client.js";
import { LocalSocketClient } from "./clients/socket-client.js";
import { LocalTaskClient } from "./clients/task-client.js";
import { LocalTimerClient } from "./clients/timer-client.js";
import { LocalTransactionClient } from "./clients/transaction-client.js";
import {
  NoPersistanceStore,
  PersistanceStore,
} from "./local-persistance-store.js";
import { LocalBucketStore } from "./stores/bucket-store.js";
import { LocalEntityStore } from "./stores/entity-store.js";
import { LocalExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { LocalExecutionHistoryStore } from "./stores/execution-history-store.js";
import { LocalExecutionStore } from "./stores/execution-store.js";
import { LocalTaskStore } from "./stores/task-store.js";
import type { WebSocketContainer } from "./web-socket-container.js";

export type LocalEvent =
  | WorkflowTask
  | TimerRequest
  | TaskWorkerRequest
  | LocalEntityStreamEvent
  | LocalEmittedEvents
  | LocalQueuePollEvent
  | Omit<BucketNotificationPutEvent, "handlerName">
  | Omit<BucketNotificationDeleteEvent, "handlerName">;

/**
 * Event that tells the environment to poll for queue events when one or more exist in the local events.
 */
export interface LocalQueuePollEvent {
  kind: "QueuePollEvent";
  queueName: string;
}

export function isLocalQueuePollEvent(
  event: LocalEvent
): event is LocalQueuePollEvent {
  return "kind" in event && event.kind === "QueuePollEvent";
}

export interface LocalEmittedEvents {
  kind: "EmittedEvents";
  events: EventEnvelope[];
}

export function isLocalEmittedEvents(
  event: LocalEvent
): event is LocalEmittedEvents {
  return "kind" in event && event.kind === "EmittedEvents";
}

interface LocalEntityStreamEvent {
  kind: "EntityStreamEvent";
  item: Omit<EntityStreamItem, "id">;
  entityName: string;
}

export function isLocalEntityStreamEvent(
  event: LocalEvent
): event is LocalEntityStreamEvent {
  return "kind" in event && event.kind === "EntityStreamEvent";
}

export interface LocalContainerProps {
  localPersistanceStore?: PersistanceStore;
  serviceName: string;
  serviceUrl: string;
  subscriptionProvider?: SubscriptionProvider;
  taskProvider?: TaskProvider;
  webSocketContainer: WebSocketContainer;
}

export class LocalContainer {
  public orchestrator: Orchestrator;
  public commandWorker: CommandWorker;
  public timerHandler: TimerHandler;
  public taskWorker: TaskWorker;
  public socketWorker: SocketWorker;
  public bucketHandlerWorker: BucketNotificationHandlerWorker;
  public entityStreamWorker: EntityStreamWorker;
  public subscriptionWorker: SubscriptionWorker;
  public transactionWorker: TransactionWorker;
  public queueHandlerWorker: QueueHandlerWorker;

  public eventClient: EventClient;
  public executionQueueClient: ExecutionQueueClient;
  public logsClient: LogsClient;
  public metricsClient: MetricsClient;
  public queueClient: LocalQueueClient;
  public serviceClient: EventualServiceClient;
  public socketClient: LocalSocketClient;
  public taskClient: TaskClient;
  public timerClient: TimerClient;
  public transactionClient: TransactionClient;
  public workflowClient: WorkflowClient;

  public executionHistoryStateStore: ExecutionHistoryStateStore;
  public executionHistoryStore: ExecutionHistoryStore;
  public executionStore: ExecutionStore;
  public taskStore: TaskStore;

  public entityProvider: EntityProvider;
  public queueProvider: QueueProvider;
  public subscriptionProvider: SubscriptionProvider;
  public taskProvider: TaskProvider;
  public workflowProvider: WorkflowProvider;

  constructor(
    private localConnector: LocalEnvConnector,
    {
      localPersistanceStore = new NoPersistanceStore(),
      ...props
    }: LocalContainerProps
  ) {
    this.executionQueueClient = new LocalExecutionQueueClient(
      this.localConnector
    );
    this.executionStore = localPersistanceStore.register("executions", (data) =>
      data
        ? LocalExecutionStore.fromSerializedData(this.localConnector, data)
        : new LocalExecutionStore(this.localConnector)
    );
    // TODO: Support local log persistance and retrieval https://github.com/functionless/eventual/issues/435
    this.logsClient = new LocalLogsClient();
    this.workflowProvider = new GlobalWorkflowProvider();
    this.queueProvider = new GlobalQueueProvider();
    this.workflowClient = new WorkflowClient(
      this.executionStore,
      this.logsClient,
      this.executionQueueClient,
      this.workflowProvider,
      () => this.localConnector.getTime()
    );
    this.timerClient = new LocalTimerClient(this.localConnector);
    this.executionHistoryStore = localPersistanceStore.register(
      "execution-history",
      (data) =>
        data
          ? LocalExecutionHistoryStore.fromSerializedData(data)
          : new LocalExecutionHistoryStore()
    );
    this.taskProvider = props.taskProvider ?? new GlobalTaskProvider();
    this.taskStore = localPersistanceStore.register("tasks", (data) =>
      LocalTaskStore.fromSerializedData(data)
    );
    this.subscriptionProvider =
      props.subscriptionProvider ?? new GlobalSubscriptionProvider();
    this.entityProvider = new GlobalEntityProvider();
    const entityStore = localPersistanceStore.register("entities", (data) =>
      LocalEntityStore.fromSerializedData(
        {
          entityProvider: this.entityProvider,
          localConnector: this.localConnector,
        },
        data
      )
    );
    const bucketStore = localPersistanceStore.register("buckets", (data) =>
      LocalBucketStore.fromSerializedData(
        {
          localConnector: this.localConnector,
        },
        data
      )
    );
    const openSearchClient = new LocalOpenSearchClient();
    this.eventClient = new LocalEventClient(this.localConnector);
    this.metricsClient = new LocalMetricsClient();
    const logAgent = new LogAgent({
      logsClient: this.logsClient,
      logLevel: { default: LogLevel.DEBUG },
      getTime: () => this.localConnector.getTime(),
    });

    this.taskClient = new LocalTaskClient(this.localConnector, {
      taskStore: this.taskStore,
      executionQueueClient: this.executionQueueClient,
      executionStore: this.executionStore,
    });

    this.executionHistoryStateStore = localPersistanceStore.register(
      "execution-history-state",
      (data) => LocalExecutionHistoryStateStore.fromSerializedData(data)
    );

    this.queueClient = localPersistanceStore.register("queues", (data) =>
      LocalQueueClient.fromSerializedData(
        this.queueProvider,
        this.localConnector,
        data
      )
    );

    this.socketClient = new LocalSocketClient(props.webSocketContainer);

    this.transactionWorker = createTransactionWorker({
      entityStore,
      entityProvider: this.entityProvider,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      serviceName: props.serviceName,
      socketClient: this.socketClient,
    });

    this.transactionClient = new LocalTransactionClient(this.transactionWorker);

    this.serviceClient = new RuntimeServiceClient({
      eventClient: this.eventClient,
      executionHistoryStateStore: this.executionHistoryStateStore,
      executionHistoryStore: this.executionHistoryStore,
      executionQueueClient: this.executionQueueClient,
      executionStore: this.executionStore,
      taskClient: this.taskClient,
      transactionClient: this.transactionClient,
      workflowClient: this.workflowClient,
      workflowProvider: this.workflowProvider,
    });

    this.bucketHandlerWorker = createBucketNotificationHandlerWorker({
      bucketStore,
      entityStore,
      openSearchClient,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceSpec: undefined,
      serviceName: props.serviceName,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });
    this.subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: this.subscriptionProvider,
      serviceClient: this.serviceClient,
      bucketStore,
      entityStore,
      openSearchClient,
      queueClient: this.queueClient,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });

    this.taskWorker = createTaskWorker({
      bucketStore,
      entityStore,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      logAgent,
      metricsClient: this.metricsClient,
      openSearchClient,
      queueClient: this.queueClient,
      serviceName: props.serviceName,
      serviceClient: this.serviceClient,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
      taskProvider: this.taskProvider,
      taskStore: this.taskStore,
      timerClient: this.timerClient,
    });

    this.entityStreamWorker = createEntityStreamWorker({
      openSearchClient,
      bucketStore,
      entityStore,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });

    this.orchestrator = createOrchestrator({
      bucketStore,
      entityStore,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      executionHistoryStore: this.executionHistoryStore,
      executorProvider: new HybridExecutorProvider({
        executionHistoryStateStore: this.executionHistoryStateStore,
      }),
      metricsClient: this.metricsClient,
      logAgent,
      openSearchClient,
      queueClient: this.queueClient,
      serviceName: props.serviceName,
      socketClient: this.socketClient,
      taskClient: this.taskClient,
      timerClient: this.timerClient,
      transactionClient: this.transactionClient,
      workflowClient: this.workflowClient,
      workflowProvider: this.workflowProvider,
    });

    this.queueHandlerWorker = createQueueHandlerWorker({
      openSearchClient,
      bucketStore,
      entityStore,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });

    this.queueHandlerWorker = createQueueHandlerWorker({
      openSearchClient,
      bucketStore,
      entityStore,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });

    this.socketWorker = createSocketWorker({
      openSearchClient,
      bucketStore,
      entityStore,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      socketClient: this.socketClient,
    });

    /**
     * Register all of the commands to run.
     */
    createListWorkflowsCommand({
      workflowProvider: this.workflowProvider,
    });
    createEmitEventsCommand({
      eventClient: this.eventClient,
    });
    createStartExecutionCommand({
      workflowClient: this.workflowClient,
    });
    createListExecutionsCommand({ executionStore: this.executionStore });
    createGetExecutionCommand({ executionStore: this.executionStore });
    createUpdateTaskCommand({ taskClient: this.taskClient });
    createSendSignalCommand({
      executionQueueClient: this.executionQueueClient,
    });
    // TODO: should this read from the live executions? or is it needed? I want to deprecate this command.
    createListWorkflowHistoryCommand({
      executionHistoryStateStore: this.executionHistoryStateStore,
    });
    createListExecutionHistoryCommand({
      executionHistoryStore: this.executionHistoryStore,
    });
    createExecuteTransactionCommand({
      transactionClient: this.transactionClient,
    });

    // must register commands before the command worker is loaded!
    this.commandWorker = createCommandWorker({
      bucketStore,
      entityStore,
      openSearchClient,
      queueClient: this.queueClient,
      serviceClient: this.serviceClient,
      serviceName: props.serviceName,
      serviceUrl: props.serviceUrl,
      serviceSpec: undefined,
      socketClient: this.socketClient,
    });

    this.timerHandler = createTimerHandler({
      taskStore: this.taskStore,
      executionQueueClient: this.executionQueueClient,
      logAgent,
      timerClient: this.timerClient,
      baseTime: () => this.localConnector.getTime(),
    });
  }
}

export interface LocalEnvConnector {
  getTime: () => Date;
  pushWorkflowTaskNextTick: (envEvent: LocalEvent) => void;
  pushWorkflowTask: (envEvent: LocalEvent) => void;
  scheduleEvent(time: Date, envEvent: LocalEvent): void;
}

export const NoOpLocalEnvConnector: LocalEnvConnector = {
  getTime: () => new Date(),
  pushWorkflowTask: () => undefined,
  pushWorkflowTaskNextTick: () => undefined,
  scheduleEvent: () => undefined,
};
