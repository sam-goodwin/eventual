import {
  ActivityFunction,
  ActivityOutput,
  clearEventSubscriptions,
  createActivityWorker,
  createEventHandlerWorker,
  createOrchestrator,
  Event,
  EventClient,
  EventEnvelope,
  EventHandler,
  EventPayload,
  EventPayloadType,
  events,
  ExecutionHandle,
  ExecutionHistoryClient,
  isWorkflowTask,
  LogAgent,
  LogLevel,
  Orchestrator,
  PublishEventsRequest,
  registerServiceClient,
  RuntimeServiceClient,
  SendActivityFailureRequest,
  SendActivitySuccessRequest,
  SendSignalRequest,
  ServiceType,
  StartExecutionRequest,
  TimerClient,
  Workflow,
  WorkflowClient,
  WorkflowRuntimeClient,
  workflows,
  WorkflowTask,
} from "@eventual/core";
import { bundleService } from "@eventual/compiler";
import { TestMetricsClient } from "./clients/metrics-client.js";
import { TestExecutionHistoryClient } from "./clients/execution-history-client.js";
import { TestWorkflowRuntimeClient } from "./clients/workflow-runtime-client.js";
import { TestEventClient } from "./clients/event-client.js";
import { TestWorkflowClient } from "./clients/workflow-client.js";
import { TestActivityRuntimeClient } from "./clients/activity-runtime-client.js";
import { TestTimerClient } from "./clients/timer-client.js";
import { TimeController } from "./time-controller.js";
import { ExecutionStore } from "./execution-store.js";
import { serviceTypeScope } from "./utils.js";
import {
  MockableActivityProvider,
  MockActivity,
} from "./providers/activity-provider.js";
import { TestEventHandlerProvider } from "./providers/event-handler-provider.js";
import { TestLogsClient } from "./clients/logs-client.js";

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

/**
 * A locally simulated workflow environment designed for unit testing.
 * Supports providing mock implementations of activities and workflow,
 * manually progressing time, and more.
 *
 * ```ts
 * const env = new TestEnvironment(...);
 * await env.initialize();
 *
 * // start a workflow
 * await env.startExecution(workflow, input);
 *
 * // manually progress time
 * await env.tick();
 * ```
 */
export class TestEnvironment extends RuntimeServiceClient {
  private serviceFile: Promise<string>;

  private timerClient: TimerClient;
  private workflowClient: WorkflowClient;
  private workflowRuntimeClient: WorkflowRuntimeClient;
  private executionHistoryClient: ExecutionHistoryClient;
  private eventClient: EventClient;

  private activityProvider: MockableActivityProvider;
  private eventHandlerProvider: TestEventHandlerProvider;

  private initialized = false;
  private timeController: TimeController<WorkflowTask>;
  private orchestrator: Orchestrator;

  constructor(props: TestEnvironmentProps) {
    const start = props.start
      ? new Date(props.start.getTime() - props.start.getMilliseconds())
      : new Date(0);
    const executionHistoryClient = new TestExecutionHistoryClient();
    const executionStore = new ExecutionStore();
    const activityRuntimeClient = new TestActivityRuntimeClient();
    const timeController = new TimeController([], {
      // start the time controller at the given start time or Date(0)
      start: start.getTime(),
      // increment by seconds
      increment: 1000,
    });
    const timeConnector: TimeConnector = {
      pushEvent: (task) => timeController.addEventAtNextTick(task),
      scheduleEvent: (time, task) =>
        timeController.addEvent(time.getTime(), task),
      getTime: () => this.time,
    };
    const timerClient = new TestTimerClient(timeConnector);
    const activityProvider = new MockableActivityProvider();
    const eventHandlerProvider = new TestEventHandlerProvider();
    const eventHandlerWorker = createEventHandlerWorker({
      // break the circular dependence on the worker and client by making the client optional in the worker
      // need to call registerEventClient before calling the handler.
      eventHandlerProvider,
    });
    const eventClient = new TestEventClient(eventHandlerWorker);
    const workflowClient = new TestWorkflowClient(
      timeConnector,
      activityRuntimeClient,
      executionStore
    );
    const testLogAgent = new LogAgent({
      logsClient: new TestLogsClient(),
      getTime: () => this.time,
      logLevel: { default: LogLevel.DEBUG },
    });
    const activityWorker = createActivityWorker({
      activityRuntimeClient,
      eventClient,
      timerClient,
      metricsClient: new TestMetricsClient(),
      workflowClient,
      activityProvider,
      logAgent: testLogAgent,
    });
    const workflowRuntimeClient = new TestWorkflowRuntimeClient(
      executionStore,
      timeConnector,
      workflowClient,
      activityWorker
    );

    super({
      eventClient,
      executionHistoryClient,
      workflowClient,
      workflowRuntimeClient,
    });

    this.serviceFile = bundleService(
      props.outDir,
      props.entry,
      ServiceType.OrchestratorWorker,
      undefined,
      true
    );

    this.timeController = timeController;
    this.executionHistoryClient = executionHistoryClient;
    this.workflowClient = workflowClient;
    this.eventHandlerProvider = eventHandlerProvider;
    this.eventClient = eventClient;
    this.timerClient = timerClient;
    this.workflowRuntimeClient = workflowRuntimeClient;
    this.activityProvider = activityProvider;

    this.orchestrator = createOrchestrator({
      timerClient: this.timerClient,
      eventClient: this.eventClient,
      workflowClient: this.workflowClient,
      workflowRuntimeClient: this.workflowRuntimeClient,
      executionHistoryClient: this.executionHistoryClient,
      metricsClient: new TestMetricsClient(),
      logAgent: testLogAgent,
    });
  }

  /**
   * Initializes a {@link TestEnvironment}, bootstrapping the workflows and event handlers
   * in the provided service entry point file.
   */
  public async initialize() {
    if (!this.initialized) {
      registerServiceClient(this);
      const _workflows = workflows();
      _workflows.clear();
      const _events = events();
      _events.clear();
      clearEventSubscriptions();
      // run the service to re-import the workflows, but transformed
      await import(await this.serviceFile);
      this.initialized = true;
    }
  }

  /**
   * Resets all mocks ({@link resetMocks}), test subscriptions ({@link resetTestSubscriptions}),
   * resets time ({@link resetTime}), and re-enables service event subscriptions
   * (if disabled; {@link enableServiceSubscriptions}).
   */
  public reset(time?: Date) {
    this.resetTime(time);
    this.resetMocks();
    this.resetTestSubscriptions();
    this.enableServiceSubscriptions();
  }

  /**
   * Resets time and clears any in flight events to the given time or to the provided start time.
   */
  public resetTime(time?: Date) {
    this.timeController.reset(time?.getTime());
  }

  /**
   * Removes all mocks, reverting to their default behavior.
   */
  public resetMocks() {
    this.activityProvider.clearMocks();
  }

  /**
   * Removes all test event subscriptions.
   */
  public resetTestSubscriptions() {
    this.eventHandlerProvider.clearTestHandlers();
  }

  /**
   * Overrides the implementation of an activity with a mock.
   *
   * ```ts
   * const mockActivity = env.mockActivity(myActivity);
   * mockActivity.succeed("hello"); // myActivity will return "hello" when invoked until the mock is reset or a new resolution is given.
   * ```
   */
  public mockActivity<A extends ActivityFunction<any, any>>(
    activity: A | string
  ): MockActivity<A> {
    return this.activityProvider.mockActivity(activity as any);
  }

  /**
   * Provides an environment local handler for an event.
   *
   * Note: this does not override other handlers for the same event.
   *       use {@link disableServiceSubscriptions} to turn off handlers
   *       included with the service or {@link resetTestSubscriptions}
   *       to clear handlers added via this method.
   */
  public subscribeEvent<E extends Event<any>>(
    event: E,
    handler: EventHandler<EventPayloadType<E>>
  ) {
    return this.eventHandlerProvider.subscribeEvent(event, handler);
  }

  /**
   * Turn off all of the event handlers registered by the service.
   */
  public disableServiceSubscriptions() {
    this.eventHandlerProvider.disableDefaultSubscriptions();
  }

  /**
   * Turn on all of the event handlers in the service.
   */
  public enableServiceSubscriptions() {
    this.eventHandlerProvider.enableDefaultSubscriptions();
  }

  /**
   * Sends a {@link signal} to a workflow execution
   * and progressed time by one second ({@link tick})
   */
  public override async sendSignal<Payload>(
    request: SendSignalRequest<Payload>
  ) {
    await super.sendSignal(request);
    return this.tick();
  }

  /**
   * Publishes one or more events of a type into the {@link TestEnvironment}.
   * and progresses time by one second ({@link tick})
   */
  public async publishEvent<Payload extends EventPayload = EventPayload>(
    event: string | Event<Payload>,
    ...payloads: Payload[]
  ) {
    await this.eventClient.publishEvents(
      ...payloads.map(
        (p): EventEnvelope<Payload> => ({
          name: typeof event === "string" ? event : event.name,
          event: p,
        })
      )
    );
    return this.tick();
  }

  /**
   * Publishes one or more events into the {@link TestEnvironment}
   * and progresses time by one second ({@link tick})
   */
  public async publishEvents(request: PublishEventsRequest) {
    await super.publishEvents(request);
    return this.tick();
  }

  /**
   * Starts a workflow execution and
   * progresses time by one second ({@link tick})
   */
  public async startExecution<W extends Workflow = Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    const execution = await super.startExecution<W>(request);
    // tick forward on explicit user action (triggering the workflow to start running)
    await this.tick();

    return execution;
  }

  /**
   * Retrieves an execution by execution id.
   */
  public async getExecution(executionId: string) {
    return this.workflowClient.getExecution(executionId);
  }

  /**
   * Succeeds an activity with a result value
   * and progressed time by one second ({@link tick}).
   *
   * Get the activity token by intercepting the token from {@link asyncResult}.
   *
   * ```ts
   * let activityToken;
   * mockActivity.asyncResult(token => activityToken);
   * // start workflow
   * env.sendActivitySuccess(activityToken, "value");
   * ```
   */
  public async sendActivitySuccess<A extends ActivityFunction<any, any> = any>(
    request: Omit<SendActivitySuccessRequest<ActivityOutput<A>>, "type">
  ) {
    await super.sendActivitySuccess(request);
    return this.tick();
  }

  /**
   * Fails an activity with a result value
   * and progressed time by one second ({@link tick}).
   *
   * Get the activity token by intercepting the token from {@link asyncResult}.
   *
   * ```ts
   * let activityToken;
   * mockActivity.asyncResult(token => activityToken);
   * // start workflow
   * env.sendActivityFailure(activityToken, "value");
   * ```
   */
  public async sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ) {
    await this.workflowClient.sendActivityFailure(request);
    return this.tick();
  }

  /**
   * The current environment time, which starts at `Date(0)` or props.start.
   */
  public get time() {
    return new Date(this.timeController.currentTick);
  }

  /**
   * Progresses time by n seconds.
   *
   * @param n - number of seconds to progress time.
   * @default progresses time by one second.
   */
  public async tick(n?: number) {
    if (n === undefined || n === 1) {
      const events = this.timeController.tick();
      await this.processTickEvents(events);
    } else if (n < 1 || !Number.isInteger(n)) {
      throw new Error(
        "Must provide a positive integer number of seconds to tick"
      );
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
   * @param time ISO8601 timestamp or {@link Date} object.
   *             If the time is in the past nothing happens.
   *             Milliseconds are ignored.
   */
  public async tickUntil(time: string | Date) {
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
    if (!events.every(isWorkflowTask)) {
      // TODO: support other event types.
      throw new Error("Unknown event types in the TimerController.");
    }

    await serviceTypeScope(ServiceType.OrchestratorWorker, () =>
      this.orchestrator(events, this.time)
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
