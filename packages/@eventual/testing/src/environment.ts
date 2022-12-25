import {
  ActivityFunction,
  clearEventSubscriptions,
  createEvent,
  createOrchestrator,
  Event,
  EventClient,
  EventEnvelope,
  EventHandler,
  EventPayload,
  EventPayloadType,
  events,
  EventualError,
  Execution,
  ExecutionHistoryClient,
  ExecutionStatus,
  groupBy,
  Orchestrator,
  registerEventClient,
  registerWorkflowClient,
  ServiceType,
  Signal,
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
import { EventHandlerController } from "./event-handler-controller.js";
import { serviceTypeScope } from "./utils.js";

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
  private workflowClient: WorkflowClient;
  private workflowRuntimeClient: WorkflowRuntimeClient;
  private executionHistoryClient: ExecutionHistoryClient;
  private eventClient: EventClient;

  private activitiesController: ActivitiesController;
  private eventHandlerController: EventHandlerController;

  private started: boolean = false;
  private timeController: TimeController<WorkflowTask>;
  private orchestrator: Orchestrator;

  private executions: Record<string, ExecutionHandle<any>> = {};

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
    this.eventHandlerController = new EventHandlerController();
    const timeConnector: TimeConnector = {
      pushEvent: (task) => this.timeController.addEventAtNextTick(task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(time.getTime(), task),
      getTime: () => this.time,
    };
    const executionStore = new ExecutionStore();
    this.executionHistoryClient = new TestExecutionHistoryClient();
    this.workflowRuntimeClient = new TestWorkflowRuntimeClient(
      executionStore,
      timeConnector,
      this.activitiesController
    );
    this.eventClient = new TestEventClient(this.eventHandlerController);
    this.workflowClient = new TestWorkflowClient(
      timeConnector,
      new TestActivityRuntimeClient(),
      executionStore
    );
    this.timerClient = new TestTimerClient(timeConnector);
    this.orchestrator = createOrchestrator({
      timerClient: this.timerClient,
      eventClient: this.eventClient,
      workflowClient: this.workflowClient,
      workflowRuntimeClient: this.workflowRuntimeClient,
      executionHistoryClient: this.executionHistoryClient,
      metricsClient: new TestMetricsClient(),
      logger: new TestLogger(),
    });
  }

  async start() {
    if (!this.started) {
      const _workflows = workflows();
      _workflows.clear();
      const _events = events();
      _events.clear();
      clearEventSubscriptions();
      // run the service to re-import the workflows, but transformed
      await import(await this.serviceFile);
      registerWorkflowClient(this.workflowClient);
      registerEventClient(this.eventClient);
      this.started = true;
    }
  }

  /**
   * Resets all mocks (@see resetMocks) and test subscriptions {@see resetTestSubscriptions},
   * resets time {@see resetTime}.
   */
  reset(time?: Date) {
    this.resetTime(time);
    this.resetMocks();
    this.resetTestSubscriptions();
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

  resetTestSubscriptions() {
    this.eventHandlerController.clearTestHandlers();
  }

  mockActivity<A extends ActivityFunction<any, any>>(
    activity: A | string
  ): MockActivity<A> {
    return this.activitiesController.mockActivity(activity as any);
  }

  subscribeEvent<E extends Event<any>>(
    event: E,
    handler: EventHandler<EventPayloadType<E>>
  ) {
    return this.eventHandlerController.subscribeEvent(event, handler);
  }

  /**
   * Turn off all of the event handlers registered by the service.
   */
  disableServiceSubscriptions() {
    this.eventHandlerController.disableDefaultSubscriptions();
  }

  /**
   * Turn on all of the event handlers in the service.
   */
  enableServiceSubscriptions() {
    this.eventHandlerController.enableDefaultSubscriptions();
  }

  async sendSignal<Payload extends any>(
    execution: ExecutionHandle<any>,
    signal: Signal<Payload>,
    payload: Payload
  ): Promise<void>;
  async sendSignal<Payload extends any>(
    executionId: string,
    signal: Signal<Payload>,
    payload: Payload
  ): Promise<void>;
  async sendSignal(
    execution: ExecutionHandle<any>,
    signalId: string,
    payload: any
  ): Promise<void>;
  async sendSignal<Payload extends any>(
    executionId: string,
    signalId: string,
    payload: Payload
  ): Promise<void>;
  async sendSignal<Payload>(
    execution: ExecutionHandle<any> | string,
    signal: Signal<Payload> | string,
    payload: Payload
  ) {
    // add a signal received event, mirroring sendSignal
    await this.workflowClient.submitWorkflowTask(
      typeof execution === "string" ? execution : execution.id,
      createEvent<SignalReceived>(
        {
          type: WorkflowEventType.SignalReceived,
          signalId: typeof signal === "string" ? signal : signal.id,
          payload,
        },
        this.time
      )
    );
    return this.tick();
  }

  /**
   * Publishes one or more events of a type into the {@link TestEnvironment}.
   */
  async publishEvent(
    eventId: string,
    ...payloads: EventPayload[]
  ): Promise<void>;
  async publishEvent<E extends Event<any>>(
    event: E,
    ...payloads: EventPayloadType<E>[]
  ): Promise<void>;
  async publishEvent<E extends Event<any>>(
    event: string | E,
    ...payloads: EventPayloadType<E>[]
  ) {
    await this.eventClient.publish(
      ...payloads.map(
        (p): EventEnvelope<EventPayloadType<E>> => ({
          name: typeof event === "string" ? event : event.name,
          event: p,
        })
      )
    );
    return this.tick();
  }

  /**
   * Publishes one or more events into the {@link TestEnvironment}.
   */
  async publishEvents(...events: EventEnvelope<EventPayload>[]) {
    await this.eventClient.publish(...events);
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

    const execution = new ExecutionHandle(executionId, this);

    this.executions[executionId] = execution;

    return execution;
  }

  /**
   * Retrieves an execution by execution id.
   */
  async getExecution(executionId: string) {
    return this.workflowClient.getExecution(executionId);
  }

  /**
   * The current environment time, which starts at `Date(0)` or props.start.
   */
  get time() {
    return new Date(this.timeController.currentTick);
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
      throw new Error("Must provide a positive number of seconds to tick");
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
  private async processTickEvents(events: WorkflowTask[]) {
    const workflowTasks = events.filter(
      (event): event is WorkflowTask =>
        "events" in event && "executionId" in event
    );
    if (workflowTasks.length !== events.length) {
      // TODO: support other event types.
      throw new Error("Unknown event types in the TimerController.");
    }
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

    await serviceTypeScope(ServiceType.OrchestratorWorker, () =>
      this.orchestrator(eventsByExecutionId, this.time)
    );
  }
}

/**
 * Proxy for write only interaction with the time controller.
 */
export interface TimeConnector {
  pushEvent(task: WorkflowTask): void;
  scheduleEvent(time: Date, task: WorkflowTask): void;
  getTime: () => Date;
}

export class ExecutionHandle<W extends Workflow<any, any>> {
  constructor(public id: string, private environment: TestEnvironment) {}
  async status() {
    return (await this.environment.getExecution(this.id))!.status;
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
    return (await this.environment.getExecution(this.id)) as Execution<
      WorkflowOutput<W>
    >;
  }

  async signal(signalId: string, payload: any): Promise<void>;
  async signal<Payload extends any>(
    signal: Signal<Payload>,
    payload: any
  ): Promise<void>;
  async signal<Payload extends any = any>(
    signal: string | Signal<Payload>,
    payload: Payload
  ): Promise<void> {
    return this.environment.sendSignal(
      this as any,
      typeof signal === "string" ? signal : signal.id,
      payload
    );
  }
}
