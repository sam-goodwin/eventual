import { LogLevel } from "@eventual/core";
import {
  ActivityClient,
  ActivityWorkerRequest,
} from "../clients/activity-client.js";
import { DictionaryClient } from "../clients/dictionary-client.js";
import { TimerClient, TimerRequest } from "../clients/timer-client.js";
import { WorkflowClient } from "../clients/workflow-client.js";
import { CommandExecutor } from "../command-executor.js";
import {
  ActivityWorker,
  createActivityWorker,
} from "../handlers/activity-worker.js";
import {
  CommandWorker,
  createCommandWorker,
} from "../handlers/command-worker.js";
import { createOrchestrator, Orchestrator } from "../handlers/orchestrator.js";
import {
  createSubscriptionWorker,
  SubscriptionWorker,
} from "../handlers/subscription-worker.js";
import { createTimerHandler, TimerHandler } from "../handlers/timer-handler.js";
import {
  ActivityStore,
  EventClient,
  ExecutionHistoryStateStore,
  ExecutionHistoryStore,
  ExecutionQueueClient,
  ExecutionStore,
  LogsClient,
  MetricsClient,
} from "../index.js";
import { LogAgent } from "../log-agent.js";
import {
  ActivityProvider,
  GlobalActivityProvider,
} from "../providers/activity-provider.js";
import { InMemoryExecutorProvider } from "../providers/executor-provider.js";
import {
  GlobalSubscriptionProvider,
  SubscriptionProvider,
} from "../providers/subscription-provider.js";
import {
  GlobalWorkflowProvider,
  WorkflowProvider,
} from "../providers/workflow-provider.js";
import {
  createGetExecutionCommand,
  createListExecutionHistoryCommand,
  createListExecutionsCommand,
  createListWorkflowHistoryCommand,
  createListWorkflowsCommand,
  createPublishEventsCommand,
  createSendSignalCommand,
  createStartExecutionCommand,
  createUpdateActivityCommand,
} from "../system-commands.js";
import { WorkflowTask } from "../tasks.js";
import { LocalActivityClient } from "./clients/activity-client.js";
import { LocalEventClient } from "./clients/event-client.js";
import { LocalExecutionQueueClient } from "./clients/execution-queue-client.js";
import { LocalLogsClient } from "./clients/logs-client.js";
import { LocalMetricsClient } from "./clients/metrics-client.js";
import { LocalTimerClient } from "./clients/timer-client.js";
import { LocalActivityStore } from "./stores/activity-store.js";
import { LocalDictionaryStore } from "./stores/dictionary-store.js";
import { LocalExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { LocalExecutionHistoryStore } from "./stores/execution-history-store.js";
import { LocalExecutionStore } from "./stores/execution-store.js";

export type LocalEvent = WorkflowTask | TimerRequest | ActivityWorkerRequest;

export interface LocalContainerProps {
  activityProvider?: ActivityProvider;
  serviceName: string;
  subscriptionProvider?: SubscriptionProvider;
}

export class LocalContainer {
  public orchestrator: Orchestrator;
  public commandWorker: CommandWorker;
  public timerHandler: TimerHandler;
  public activityWorker: ActivityWorker;
  public subscriptionWorker: SubscriptionWorker;

  public activityClient: ActivityClient;
  public eventClient: EventClient;
  public executionQueueClient: ExecutionQueueClient;
  public workflowClient: WorkflowClient;
  public logsClient: LogsClient;
  public timerClient: TimerClient;
  public metricsClient: MetricsClient;

  public executionHistoryStateStore: ExecutionHistoryStateStore;
  public executionHistoryStore: ExecutionHistoryStore;
  public executionStore: ExecutionStore;
  public activityStore: ActivityStore;

  public workflowProvider: WorkflowProvider;
  public activityProvider: ActivityProvider;
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
    this.activityProvider =
      props.activityProvider ?? new GlobalActivityProvider();
    this.activityStore = new LocalActivityStore();
    this.subscriptionProvider =
      props.subscriptionProvider ?? new GlobalSubscriptionProvider();
    const dictionaryClient = new DictionaryClient(new LocalDictionaryStore());
    this.subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: this.subscriptionProvider,
      dictionaryClient,
    });
    this.eventClient = new LocalEventClient(this.subscriptionWorker);
    this.metricsClient = new LocalMetricsClient();
    const logAgent = new LogAgent({
      logsClient: this.logsClient,
      logLevel: { default: LogLevel.DEBUG },
      getTime: () => this.localConnector.getTime(),
    });

    this.activityWorker = createActivityWorker({
      activityProvider: this.activityProvider,
      activityStore: this.activityStore,
      eventClient: this.eventClient,
      executionQueueClient: this.executionQueueClient,
      logAgent,
      metricsClient: this.metricsClient,
      serviceName: props.serviceName,
      timerClient: this.timerClient,
      dictionaryClient,
    });
    this.activityClient = new LocalActivityClient(this.localConnector, {
      activityStore: this.activityStore,
      executionQueueClient: this.executionQueueClient,
      executionStore: this.executionStore,
    });

    this.orchestrator = createOrchestrator({
      commandExecutor: new CommandExecutor({
        activityClient: this.activityClient,
        eventClient: this.eventClient,
        executionQueueClient: this.executionQueueClient,
        timerClient: this.timerClient,
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
    createPublishEventsCommand({
      eventClient: this.eventClient,
    });
    createStartExecutionCommand({
      workflowClient: this.workflowClient,
    });
    createListExecutionsCommand({ executionStore: this.executionStore });
    createGetExecutionCommand({ executionStore: this.executionStore });
    createUpdateActivityCommand({ activityClient: this.activityClient });
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

    // must register commands before the command worker is loaded!
    this.commandWorker = createCommandWorker({ dictionaryClient });

    this.timerHandler = createTimerHandler({
      activityStore: this.activityStore,
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
