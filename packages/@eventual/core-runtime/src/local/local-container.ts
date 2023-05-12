import {
  BucketNotificationDeleteEvent,
  BucketNotificationPutEvent,
  EntityStreamInsertItem,
  EntityStreamModifyItem,
  EntityStreamRemoveItem,
  LogLevel,
} from "@eventual/core";
import { EventClient } from "../clients/event-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { LogsClient } from "../clients/logs-client.js";
import { MetricsClient } from "../clients/metrics-client.js";
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
import { InMemoryExecutorProvider } from "../providers/executor-provider.js";
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
import { WorkflowCallExecutor } from "../workflow-call-executor.js";
import { LocalEventClient } from "./clients/event-client.js";
import { LocalExecutionQueueClient } from "./clients/execution-queue-client.js";
import { LocalLogsClient } from "./clients/logs-client.js";
import { LocalMetricsClient } from "./clients/metrics-client.js";
import { LocalTaskClient } from "./clients/task-client.js";
import { LocalTimerClient } from "./clients/timer-client.js";
import { LocalTransactionClient } from "./clients/transaction-client.js";
import { LocalBucketStore } from "./stores/bucket-store.js";
import { LocalEntityStore } from "./stores/entity-store.js";
import { LocalExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { LocalExecutionHistoryStore } from "./stores/execution-history-store.js";
import { LocalExecutionStore } from "./stores/execution-store.js";
import { LocalTaskStore } from "./stores/task-store.js";

export type LocalEvent =
  | WorkflowTask
  | TimerRequest
  | TaskWorkerRequest
  | Omit<EntityStreamInsertItem<any>, "streamName">
  | Omit<EntityStreamRemoveItem<any>, "streamName">
  | Omit<EntityStreamModifyItem<any>, "streamName">
  | Omit<BucketNotificationPutEvent, "handlerName">
  | Omit<BucketNotificationDeleteEvent, "handlerName">;

export interface LocalContainerProps {
  taskProvider?: TaskProvider;
  serviceName: string;
  serviceUrl: string;
  subscriptionProvider?: SubscriptionProvider;
}

export class LocalContainer {
  public orchestrator: Orchestrator;
  public commandWorker: CommandWorker;
  public timerHandler: TimerHandler;
  public taskWorker: TaskWorker;
  public bucketHandlerWorker: BucketNotificationHandlerWorker;
  public entityStreamWorker: EntityStreamWorker;
  public subscriptionWorker: SubscriptionWorker;
  public transactionWorker: TransactionWorker;

  public taskClient: TaskClient;
  public eventClient: EventClient;
  public executionQueueClient: ExecutionQueueClient;
  public workflowClient: WorkflowClient;
  public logsClient: LogsClient;
  public timerClient: TimerClient;
  public metricsClient: MetricsClient;
  public transactionClient: TransactionClient;

  public executionHistoryStateStore: ExecutionHistoryStateStore;
  public executionHistoryStore: ExecutionHistoryStore;
  public executionStore: ExecutionStore;
  public taskStore: TaskStore;

  public entityProvider: EntityProvider;
  public subscriptionProvider: SubscriptionProvider;
  public taskProvider: TaskProvider;
  public workflowProvider: WorkflowProvider;

  constructor(
    private localConnector: LocalEnvConnector,
    props: LocalContainerProps
  ) {
    this.executionQueueClient = new LocalExecutionQueueClient(
      this.localConnector
    );
    this.executionStore = new LocalExecutionStore(this.localConnector);
    this.logsClient = new LocalLogsClient();
    this.workflowProvider = new GlobalWorkflowProvider();
    this.workflowClient = new WorkflowClient(
      this.executionStore,
      this.logsClient,
      this.executionQueueClient,
      this.workflowProvider,
      () => this.localConnector.getTime()
    );
    this.timerClient = new LocalTimerClient(this.localConnector);
    this.executionHistoryStore = new LocalExecutionHistoryStore();
    this.taskProvider = props.taskProvider ?? new GlobalTaskProvider();
    this.taskStore = new LocalTaskStore();
    this.subscriptionProvider =
      props.subscriptionProvider ?? new GlobalSubscriptionProvider();
    this.entityProvider = new GlobalEntityProvider();
    const entityStore = new LocalEntityStore({
      entityProvider: this.entityProvider,
      localConnector: this.localConnector,
    });
    const bucketStore = new LocalBucketStore({
      localConnector: this.localConnector,
    });
    this.bucketHandlerWorker = createBucketNotificationHandlerWorker({
      bucketStore,
      entityStore,
      serviceClient: undefined,
      serviceSpec: undefined,
      serviceName: props.serviceName,
      serviceUrl: props.serviceUrl,
    });
    this.subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: this.subscriptionProvider,
      serviceClient: undefined,
      bucketStore,
      entityStore,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
    });
    this.eventClient = new LocalEventClient(this.subscriptionWorker);
    this.metricsClient = new LocalMetricsClient();
    const logAgent = new LogAgent({
      logsClient: this.logsClient,
      logLevel: { default: LogLevel.DEBUG },
      getTime: () => this.localConnector.getTime(),
    });

    this.taskWorker = createTaskWorker({
      bucketStore,
      entityStore,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      logAgent,
      metricsClient: this.metricsClient,
      serviceName: props.serviceName,
      serviceClient: undefined,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
      taskProvider: this.taskProvider,
      taskStore: this.taskStore,
      timerClient: this.timerClient,
    });
    this.taskClient = new LocalTaskClient(this.localConnector, {
      taskStore: this.taskStore,
      executionQueueClient: this.executionQueueClient,
      executionStore: this.executionStore,
    });

    this.entityStreamWorker = createEntityStreamWorker({
      bucketStore,
      entityStore,
      serviceClient: undefined,
      serviceName: props.serviceName,
      serviceSpec: undefined,
      serviceUrl: props.serviceUrl,
    });

    this.transactionWorker = createTransactionWorker({
      entityStore,
      entityProvider: this.entityProvider,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      serviceName: props.serviceName,
    });

    this.transactionClient = new LocalTransactionClient(this.transactionWorker);

    this.orchestrator = createOrchestrator({
      callExecutor: new WorkflowCallExecutor({
        bucketStore,
        entityStore,
        eventClient: this.eventClient,
        executionQueueClient: this.executionQueueClient,
        taskClient: this.taskClient,
        timerClient: this.timerClient,
        transactionClient: this.transactionClient,
        workflowClient: this.workflowClient,
      }),
      workflowClient: this.workflowClient,
      timerClient: this.timerClient,
      serviceName: props.serviceName,
      executionHistoryStore: this.executionHistoryStore,
      executorProvider: new InMemoryExecutorProvider(),
      workflowProvider: this.workflowProvider,
      logAgent,
      metricsClient: this.metricsClient,
    });

    this.executionHistoryStateStore = new LocalExecutionHistoryStateStore();

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
      entityStore,
      bucketStore,
      serviceClient: undefined,
      serviceName: props.serviceName,
      serviceUrl: props.serviceUrl,
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
