import {
  BucketStreamDeleteItem,
  BucketStreamPutItem,
  EntityStreamInsertItem,
  EntityStreamModifyItem,
  EntityStreamRemoveItem,
  LogLevel,
} from "@eventual/core";
import { EntityClient } from "../clients/entity-client.js";
import { EventClient } from "../clients/event-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { LogsClient } from "../clients/logs-client.js";
import { MetricsClient } from "../clients/metrics-client.js";
import { TaskClient, TaskWorkerRequest } from "../clients/task-client.js";
import type { TimerClient, TimerRequest } from "../clients/timer-client.js";
import { TransactionClient } from "../clients/transaction-client.js";
import { WorkflowClient } from "../clients/workflow-client.js";
import {
  BucketStreamWorker,
  createBucketStreamWorker,
} from "../handlers/bucket-stream-worker.js";
import {
  CommandWorker,
  createCommandWorker,
} from "../handlers/command-worker.js";
import {
  createEntityStreamWorker,
  EntityStreamWorker,
} from "../handlers/entity-stream-worker.js";
import { createOrchestrator, Orchestrator } from "../handlers/orchestrator.js";
import {
  createSubscriptionWorker,
  SubscriptionWorker,
} from "../handlers/subscription-worker.js";
import { createTaskWorker, TaskWorker } from "../handlers/task-worker.js";
import { createTimerHandler, TimerHandler } from "../handlers/timer-handler.js";
import {
  createTransactionWorker,
  TransactionWorker,
} from "../handlers/transaction-worker.js";
import { LogAgent } from "../log-agent.js";
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
  | Omit<BucketStreamPutItem, "streamName">
  | Omit<BucketStreamDeleteItem, "streamName">;

export interface LocalContainerProps {
  taskProvider?: TaskProvider;
  serviceName: string;
  subscriptionProvider?: SubscriptionProvider;
}

export class LocalContainer {
  public orchestrator: Orchestrator;
  public commandWorker: CommandWorker;
  public timerHandler: TimerHandler;
  public taskWorker: TaskWorker;
  public bucketStreamWorker: BucketStreamWorker;
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

  public workflowProvider: WorkflowProvider;
  public taskProvider: TaskProvider;
  public subscriptionProvider: SubscriptionProvider;

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
    const entityStore = new LocalEntityStore({
      localConnector: this.localConnector,
    });
    const entityClient = new EntityClient(entityStore);
    const bucketStore = new LocalBucketStore({
      localConnector: this.localConnector,
    });
    this.bucketStreamWorker = createBucketStreamWorker({
      bucketStore,
      entityClient,
      serviceClient: undefined,
    });
    this.subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: this.subscriptionProvider,
      serviceClient: undefined,
      bucketStore,
      entityClient,
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
      entityClient,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      logAgent,
      metricsClient: this.metricsClient,
      serviceName: props.serviceName,
      serviceClient: undefined,
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
      entityClient,
      serviceClient: undefined,
    });

    this.transactionWorker = createTransactionWorker({
      entityStore,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
    });

    this.transactionClient = new LocalTransactionClient(this.transactionWorker);

    this.orchestrator = createOrchestrator({
      callExecutor: new WorkflowCallExecutor({
        taskClient: this.taskClient,
        eventClient: this.eventClient,
        executionQueueClient: this.executionQueueClient,
        timerClient: this.timerClient,
        transactionClient: this.transactionClient,
        workflowClient: this.workflowClient,
        entityClient,
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
      entityClient,
      serviceClient: undefined,
      bucketStore,
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
  pushWorkflowTask: () => {},
  pushWorkflowTaskNextTick: () => {},
  scheduleEvent: () => {},
};
