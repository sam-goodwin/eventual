import {
  EventualServiceClient,
  HttpRequest,
  HttpResponse,
  LogLevel,
} from "@eventual/core";
import { isTimerRequest, TimerRequest } from "../clients/timer-client.js";
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
import { createSubscriptionWorker } from "../handlers/subscription-worker.js";
import { createTimerHandler, TimerHandler } from "../handlers/timer-handler.js";
import {
  ActivityWorkerRequest,
  isActivitySendEventRequest,
  isActivityWorkerRequest,
} from "../index.js";
import { LogAgent } from "../log-agent.js";
import { GlobalActivityProvider } from "../providers/activity-provider.js";
import { InMemoryExecutorProvider } from "../providers/executor-provider.js";
import { GlobalSubscriptionProvider } from "../providers/subscription-provider.js";
import { GlobalWorkflowProvider } from "../providers/workflow-provider.js";
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
import { isWorkflowTask, WorkflowTask } from "../tasks.js";
import { LocalActivityClient } from "./clients/activity-client.js";
import { LocalEventClient } from "./clients/event-client.js";
import { LocalExecutionQueueClient } from "./clients/execution-queue-client.js";
import { LocalLogsClient } from "./clients/logs-client.js";
import { LocalMetricsClient } from "./clients/metrics-client.js";
import { LocalTimerClient } from "./clients/timer-client.js";
import { LocalActivityStore } from "./stores/activity-store.js";
import { LocalExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { LocalExecutionHistoryStore } from "./stores/execution-history-store.js";
import { LocalExecutionStore } from "./stores/execution-store.js";
import { TimeController } from "./time-controller.js";

export class LocalEnvironment {
  private timeController: TimeController<
    WorkflowTask | TimerRequest | ActivityWorkerRequest
  >;
  private orchestrator: Orchestrator;
  private commandWorker: CommandWorker;
  private timerHandler: TimerHandler;
  private activityWorker: ActivityWorker;
  private localConnector: LocalEnvConnector;
  private running: boolean = false;
  constructor(serviceClient: EventualServiceClient) {
    this.timeController = new TimeController([], {
      increment: 1,
      start: new Date().getTime(),
    });
    this.localConnector = {
      getTime: () => new Date(),
      pushWorkflowTask: (task) =>
        this.timeController.addEvent(new Date().getTime(), task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(time.getTime(), task),
    };
    const executionQueueClient = new LocalExecutionQueueClient(
      this.localConnector
    );
    const executionStore = new LocalExecutionStore(this.localConnector);
    const logsClient = new LocalLogsClient();
    const workflowProvider = new GlobalWorkflowProvider();
    const workflowClient = new WorkflowClient(
      executionStore,
      logsClient,
      executionQueueClient,
      workflowProvider
    );
    const timerClient = new LocalTimerClient(this.localConnector);
    const executionHistoryStore = new LocalExecutionHistoryStore();
    const activityProvider = new GlobalActivityProvider();
    const activityStore = new LocalActivityStore();
    const subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: new GlobalSubscriptionProvider(),
      serviceClient,
    });
    const eventClient = new LocalEventClient(subscriptionWorker);
    const metricsClient = new LocalMetricsClient();
    const logAgent = new LogAgent({
      logsClient: new LocalLogsClient(),
      logLevel: { default: LogLevel.DEBUG },
    });

    this.activityWorker = createActivityWorker({
      activityProvider,
      activityStore,
      eventClient,
      executionQueueClient,
      logAgent,
      metricsClient,
      serviceName: "fixme",
      timerClient,
      serviceClient,
    });
    const activityClient = new LocalActivityClient(this.localConnector, {
      activityStore,
      executionQueueClient,
      executionStore,
    });

    this.orchestrator = createOrchestrator({
      commandExecutor: new CommandExecutor({
        activityClient,
        eventClient,
        executionQueueClient: executionQueueClient,
        timerClient,
        workflowClient: workflowClient,
      }),
      workflowClient,
      timerClient,
      serviceName: "fixme",
      executionHistoryStore,
      executorProvider: new InMemoryExecutorProvider(),
      workflowProvider,
    });

    /**
     * Register all of the commands to run.
     */
    createListWorkflowsCommand({
      workflowProvider,
    });
    createPublishEventsCommand({
      eventClient,
    });
    createStartExecutionCommand({
      workflowClient,
    });
    createListExecutionsCommand({ executionStore });
    createGetExecutionCommand({ executionStore });
    createUpdateActivityCommand({ activityClient });
    createSendSignalCommand({ executionQueueClient });
    // TODO: should this read from the live executions? or is it needed? I want to deprecate this command.
    createListWorkflowHistoryCommand({
      executionHistoryStateStore: new LocalExecutionHistoryStateStore(),
    });
    createListExecutionHistoryCommand({ executionHistoryStore });

    // must register commands before the command worker is loaded!
    this.commandWorker = createCommandWorker({
      serviceClient: serviceClient,
    });

    this.timerHandler = createTimerHandler({
      activityStore,
      executionQueueClient,
      logAgent,
      timerClient,
    });

    this.start();
  }

  private start() {
    this.running = true;
    this.processEvents();
  }

  private async processEvents() {
    let events: (WorkflowTask | TimerRequest | ActivityWorkerRequest)[] = [];
    while (
      (events = this.timeController.tickUntil(new Date().getTime())).length > 0
    ) {
      const timerRequests = events.filter(isTimerRequest);
      const workflowTasks = events.filter(isWorkflowTask);
      const activityWorkerRequests = events.filter(isActivityWorkerRequest);

      activityWorkerRequests.map(async (request) => {
        const result = await this.activityWorker(request);
        if (!!result && isActivitySendEventRequest(result)) {
          this.localConnector.pushWorkflowTask({
            events: [result.event],
            executionId: result.executionId,
          });
        }
      });
      timerRequests.map((request) => this.timerHandler(request));

      await this.orchestrator(workflowTasks);
    }

    if (this.running) {
      setTimeout(() => {
        this.processEvents();
      }, 100);
    }
  }

  public stop() {
    this.running = false;
  }

  public async invokeCommandOrApi(
    httpRequest: HttpRequest
  ): Promise<HttpResponse> {
    return this.commandWorker(httpRequest);
  }
}

export interface LocalEnvConnector {
  getTime: () => Date;
  pushWorkflowTask: (
    workflowEvent: WorkflowTask | TimerRequest | ActivityWorkerRequest
  ) => void;
  scheduleEvent(
    time: Date,
    task: WorkflowTask | TimerRequest | ActivityWorkerRequest
  ): void;
}
