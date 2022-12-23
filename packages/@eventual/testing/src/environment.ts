import {
  ActivityFunction,
  createEvent,
  createOrchestrator,
  EventClient,
  EventualError,
  Execution,
  ExecutionHistoryClient,
  ExecutionStatus,
  groupBy,
  ServiceType,
  SERVICE_TYPE_FLAG,
  Signal,
  SignalPayload,
  SignalReceived,
  TimerClient,
  Workflow,
  WorkflowClient,
  WorkflowEventType,
  WorkflowInput,
  WorkflowOutput,
  WorkflowRuntimeClient,
  workflows,
  WorkflowTask,
} from "@eventual/core";
import { bundleService } from "@eventual/compiler";
import { TestMetricsClient } from "./clients/metrics-client.js";
import { TestLogger } from "./clients/logger.js";
import { TestExecutionHistoryClient } from "./clients/execution-history-client.js";
import { TestWorkflowRuntimeClient } from "./clients/workflow-runtime-client.js";
import { TestEventClient } from "./clients/event-client.js";
import { TestWorkflowClient } from "./clients/workflow-client.js";
import { TestActivityRuntimeClient } from "./clients/activity-runtime-client.js";
import { TestTimerClient } from "./clients/timer-client.js";
import { TimeController } from "./time-controller.js";
import { InProgressError } from "./error.js";
import { ExecutionStore } from "./execution-store.js";
import { ActivitiesController, MockActivity } from "./activities-controller.js";

export interface TestEnvironmentProps {
  entry: string;
  outDir: string;
  /**
   * Start time, starting at the nearest second (rounded down).
   *
   * @default Date(0)
   */
  start?: Date;
}

export class TestEnvironment {
  private serviceFile: Promise<string>;

  private timerClient: TimerClient;
  public workflowClient: WorkflowClient;
  private workflowRuntimeClient: WorkflowRuntimeClient;
  private executionHistoryClient: ExecutionHistoryClient;
  private eventClient: EventClient;

  private activitiesController: ActivitiesController;

  private started: boolean = false;
  private timeController: TimeController<WorkflowTask>;

  public executions: Record<string, ExecutionHandle<any>> = {};

  constructor(props: TestEnvironmentProps) {
    this.serviceFile = bundleService(
      props.outDir,
      props.entry,
      ServiceType.OrchestratorWorker,
      ["@eventual/core"]
    );
    const start = props.start
      ? new Date(props.start.getTime() - props.start.getMilliseconds())
      : new Date(0);
    this.timeController = new TimeController([], {
      // start the time controller at the given start time or Date(0)
      start: start.getTime(),
      // increment by seconds
      increment: 1000,
    });
    this.activitiesController = new ActivitiesController();
    const timeConnector: TimeConnector = {
      pushEvent: (task) => this.timeController.addEventAtNext(task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(time.getTime(), task),
      time: undefined as any,
    };
    Object.defineProperty(timeConnector, "time", {
      get: () => this.time,
    });
    const executionStore = new ExecutionStore();
    this.executionHistoryClient = new TestExecutionHistoryClient();
    this.workflowRuntimeClient = new TestWorkflowRuntimeClient(
      executionStore,
      timeConnector,
      this.activitiesController
    );
    this.eventClient = new TestEventClient();
    this.workflowClient = new TestWorkflowClient(
      timeConnector,
      new TestActivityRuntimeClient(),
      executionStore
    );
    this.timerClient = new TestTimerClient(timeConnector);
  }

  async start() {
    if (!this.started) {
      const _workflows = workflows();
      _workflows.clear();
      // run the service to re-import the workflows, but transformed
      await import(await this.serviceFile);
      this.started = true;
    }
  }

  /**
   * Resets all mocks (@see resetMocks) and resets time {@see resetTime}.
   */
  reset(time?: Date) {
    this.resetTime(time);
    this.resetMocks();
  }

  resetTime(time?: Date) {
    this.timeController.reset(time?.getTime());
  }

  /**
   * Removes all mocks, reverting to their default behavior.
   */
  resetMocks() {
    this.activitiesController.clearMocks();
  }

  mockActivity<A extends ActivityFunction<any, any>>(
    activity: A
  ): MockActivity<A>;
  mockActivity(activityId: string): MockActivity<any>;
  mockActivity<A extends ActivityFunction<any, any>>(activity: A | string) {
    return this.activitiesController.mockActivity(activity as any);
  }

  async sendSignal<S extends Signal<any>>(
    execution: ExecutionHandle<any>,
    signal: S,
    payload: SignalPayload<S>
  ): Promise<void>;
  async sendSignal<S extends Signal<any>>(
    executionId: string,
    signal: S,
    payload: SignalPayload<S>
  ): Promise<void>;
  async sendSignal(
    execution: ExecutionHandle<any>,
    signalId: string,
    payload: any
  ): Promise<void>;
  async sendSignal<S extends Signal<any>>(
    executionId: string,
    signalId: string,
    payload: SignalPayload<S>
  ): Promise<void>;
  async sendSignal<S extends Signal = Signal<any>>(
    execution: ExecutionHandle<any> | string,
    signal: S | string,
    payload: SignalPayload<S>
  ) {
    // add a signal received event, mirroring sendSignal
    this.timeController.addEventAtNext({
      executionId: typeof execution === "string" ? execution : execution.id,
      events: [
        createEvent<SignalReceived>(
          {
            type: WorkflowEventType.SignalReceived,
            signalId: typeof signal === "string" ? signal : signal.id,
            payload,
          },
          this.time
        ),
      ],
    });
    return this.tick();
  }

  async startExecution<W extends Workflow<any, any> = any>(
    workflowName: string,
    input: WorkflowInput<W>
  ): Promise<ExecutionHandle<W>>;
  async startExecution<W extends Workflow<any, any> = Workflow<any, any>>(
    workflow: W,
    input: WorkflowInput<W>
  ): Promise<ExecutionHandle<W>>;
  async startExecution<W extends Workflow<any, any> = Workflow<any, any>>(
    workflow: W | string,
    input: WorkflowInput<W>
  ): Promise<ExecutionHandle<W>> {
    const workflowName =
      typeof workflow === "string" ? workflow : workflow.workflowName;

    const executionId = await this.workflowClient.startWorkflow({
      workflowName: workflowName,
      input,
    });

    // tick forward on explicit user action (triggering the workflow to start running)
    await this.tick();

    const execution = new ExecutionHandle(
      executionId,
      this,
      this.workflowRuntimeClient
    );

    this.executions[executionId] = execution;

    return execution;
  }

  get time() {
    return new Date(this.timeController.time);
  }

  /**
   * Progresses time by n seconds.
   *
   * @param n - number of seconds to progress time.
   * @default progresses time by one second.
   */
  async tick(n?: number) {
    if (n === undefined || n === 1) {
      const events = this.timeController.tick();
      await this.processTickEvents(events);
    } else if (n < 1) {
      return;
    } else {
      // process each batch of event for n ticks.
      // note: we may get back fewer than n groups if there are not events for each tick.
      const eventGenerator = this.timeController.tickIncremental(n);
      for (const events of eventGenerator) {
        await this.processTickEvents(events);
      }
    }
  }

  /**
   * Progresses time to a point in time.
   *
   * If the time is in the past nothing happens.
   * Milliseconds are ignored.
   */
  async tickUntil(time: string) {
    // compute the ticks instead of using tickUntil in order to use tickIncremental
    // and share the tick logic.
    // consider adding a tickUntilIncremental
    const ticks = Math.floor(
      (new Date(time).getTime() - this.time.getTime()) / 1000
    );
    if (ticks > 0) {
      await this.tick(ticks);
    }
  }

  /**
   * Process the events from a single tick/second.
   */
  private async processTickEvents(
    events: ReturnType<typeof this.timeController.tick>
  ) {
    const workflowTasks = events.filter(
      (event): event is WorkflowTask =>
        "events" in event && "executionId" in event
    );
    if (workflowTasks.length !== events.length) {
      // TODO: support other event types.
      throw new Error("Unknown event types in the TimerController.");
    }
    const orchestrator = this.createOrchestrator();

    const tasksByExecutionId = groupBy(
      workflowTasks,
      (task) => task.executionId
    );

    const eventsByExecutionId = Object.fromEntries(
      Object.entries(tasksByExecutionId).map(([executionId, records]) => [
        executionId,
        records.flatMap((e) => e.events),
      ])
    );

    const back = process.env[SERVICE_TYPE_FLAG];
    process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
    await orchestrator.orchestrateExecutions(eventsByExecutionId, this.time);
    process.env[SERVICE_TYPE_FLAG] = back;
  }

  private createOrchestrator() {
    return createOrchestrator({
      timerClient: this.timerClient,
      eventClient: this.eventClient,
      workflowClient: this.workflowClient,
      workflowRuntimeClient: this.workflowRuntimeClient,
      executionHistoryClient: this.executionHistoryClient,
      metricsClient: new TestMetricsClient(),
      logger: new TestLogger(),
    });
  }
}

/**
 * Proxy for write only interaction with the time controller.
 */
export interface TimeConnector {
  pushEvent(task: WorkflowTask): void;
  scheduleEvent(time: Date, task: WorkflowTask): void;
  time: Date;
}

export class ExecutionHandle<W extends Workflow<any, any>> {
  constructor(
    public id: string,
    private environment: TestEnvironment,
    private workflowRuntimeClient: WorkflowRuntimeClient
  ) {}
  // TODO: remove this?
  history() {
    this.workflowRuntimeClient.getHistory(this.id);
  }
  async status() {
    return (await this.environment.workflowClient.getExecution(this.id))!
      .status;
  }
  async result() {
    const execution = await this.getExecution();
    if (execution.status === ExecutionStatus.IN_PROGRESS) {
      throw new InProgressError("Workflow is still in progress");
    } else if (execution.status === ExecutionStatus.FAILED) {
      throw new EventualError(execution.error, execution.message);
    } else {
      return execution.result;
    }
  }
  async getExecution(): Promise<Execution<WorkflowOutput<W>>> {
    return (await this.environment.workflowClient.getExecution(
      this.id
    )) as Execution<WorkflowOutput<W>>;
  }

  async signal(signalId: string, payload: any): Promise<void>;
  async signal<S extends Signal<any>>(signal: S, payload: any): Promise<void>;
  async signal<S extends Signal<any> = any>(
    signal: string | S,
    payload: SignalPayload<S>
  ): Promise<void> {
    return this.environment.sendSignal(
      this as any,
      typeof signal === "string" ? signal : signal.id,
      payload
    );
  }
}
