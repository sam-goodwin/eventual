import {
  EventualServiceClient,
  HttpRequest,
  HttpResponse,
  LogLevel,
} from "@eventual/core";
import { WorkflowClient } from "../clients/workflow-client.js";
import { CommandExecutor } from "../command-executor.js";
import { createActivityWorker } from "../handlers/activity-worker.js";
import {
  CommandWorker,
  createCommandWorker,
} from "../handlers/command-worker.js";
import { createOrchestrator, Orchestrator } from "../handlers/orchestrator.js";
import { createSubscriptionWorker } from "../handlers/subscription-worker.js";
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
import { WorkflowTask } from "../tasks.js";
import { TestActivityClient } from "./clients/activity-client.js";
import { TestEventClient } from "./clients/event-client.js";
import { LocalExecutionQueueClient } from "./clients/execution-queue-client.js";
import { TestLogsClient } from "./clients/logs-client.js";
import { TestMetricsClient } from "./clients/metrics-client.js";
import { TestTimerClient } from "./clients/timer-client.js";
import { TestActivityStore } from "./stores/activity-store.js";
import { TestExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { TestExecutionHistoryStore } from "./stores/execution-history-store.js";
import { TestExecutionStore } from "./stores/execution-store.js";
import { TimeController } from "./time-controller.js";

export class LocalEnvironment {
  private poller: NodeJS.Timer;
  private timeController: TimeController<WorkflowTask>;
  private orchestrator: Orchestrator;
  private commandWorker: CommandWorker;
  constructor(serviceClient: EventualServiceClient) {
    this.timeController = new TimeController([], {
      increment: 1,
      start: new Date().getTime(),
    });
    const localConnector: LocalEnvConnector = {
      getTime: () => new Date(this.timeController.currentTick),
      pushWorkflowTask: (task) =>
        this.timeController.addEvent(new Date().getTime(), task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(time.getTime(), task),
    };
    const executionQueueClient = new LocalExecutionQueueClient(localConnector);
    const executionStore = new TestExecutionStore(localConnector);
    const logsClient = new TestLogsClient();
    const workflowProvider = new GlobalWorkflowProvider();
    const workflowClient = new WorkflowClient(
      executionStore,
      logsClient,
      executionQueueClient,
      workflowProvider
    );
    const timerClient = new TestTimerClient(localConnector);
    const executionHistoryStore = new TestExecutionHistoryStore();
    const activityProvider = new GlobalActivityProvider();
    const activityStore = new TestActivityStore();
    const subscriptionWorker = createSubscriptionWorker({
      subscriptionProvider: new GlobalSubscriptionProvider(),
      serviceClient,
    });
    const eventClient = new TestEventClient(subscriptionWorker);
    const metricsClient = new TestMetricsClient();
    const logAgent = new LogAgent({
      logsClient: new TestLogsClient(),
      getTime: () => new Date(this.timeController.currentTick),
      logLevel: { default: LogLevel.DEBUG },
    });

    const activityWorker = createActivityWorker({
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
    const activityClient = new TestActivityClient(
      localConnector,
      activityWorker,
      {
        activityStore,
        executionQueueClient,
        executionStore,
        baseTime: () => new Date(this.timeController.currentTick),
      }
    );

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
      executionHistoryStateStore: new TestExecutionHistoryStateStore(),
    });
    createListExecutionHistoryCommand({ executionHistoryStore });

    // must register commands before the command worker is loaded!
    this.commandWorker = createCommandWorker({
      serviceClient: serviceClient,
    });

    this.poller = this.start();
  }

  private start() {
    return setInterval(async () => {
      const tasks = this.timeController.tickUntil(new Date().getTime());
      await this.orchestrator(
        tasks,
        () => new Date(this.timeController.currentTick)
      );
    }, 100);
  }

  public stop() {
    clearInterval(this.poller);
  }

  public async invokeCommandOrApi(
    httpRequest: HttpRequest
  ): Promise<HttpResponse> {
    return this.commandWorker(httpRequest);
  }
}

export interface LocalEnvConnector {
  getTime: () => Date;
  pushWorkflowTask: (workflowEvent: WorkflowTask) => void;
  scheduleEvent(time: Date, task: WorkflowTask): void;
}
