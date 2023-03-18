import {
  Activity,
  ActivityOutput,
  Event,
  EventEnvelope,
  EventPayload,
  EventPayloadType,
  ExecutionHandle,
  LogLevel,
  PublishEventsRequest,
  SendActivityFailureRequest,
  SendActivitySuccessRequest,
  SendSignalRequest,
  StartExecutionRequest,
  SubscriptionHandler,
  Workflow,
} from "@eventual/core";
import {
  ActivityClient,
  ActivitySendEventRequest,
  ActivityWorker,
  ActivityWorkerRequest,
  CommandExecutor,
  createActivityWorker,
  createOrchestrator,
  createSubscriptionWorker,
  createTimerHandler,
  EventClient,
  ExecutionHistoryStore,
  ExecutionStore,
  GlobalWorkflowProvider,
  InMemoryExecutorProvider,
  isActivitySendEventRequest,
  isActivityWorkerRequest,
  isTimerRequest,
  isWorkflowTask,
  LocalActivityClient,
  LocalActivityStore,
  LocalEnvConnector,
  LocalEventClient,
  LocalExecutionHistoryStateStore,
  LocalExecutionHistoryStore,
  LocalExecutionQueueClient,
  LocalExecutionStore,
  LocalLogsClient,
  LocalMetricsClient,
  LocalTimerClient,
  LogAgent,
  Orchestrator,
  RuntimeServiceClient,
  TimerClient,
  TimerHandler,
  TimerRequest,
  WorkflowClient,
  WorkflowTask,
} from "@eventual/core-runtime";
import { ActivityInput, registerServiceClient } from "@eventual/core/internal";
import {
  MockableActivityProvider,
  MockActivity,
} from "./providers/activity-provider.js";
import { TestSubscriptionProvider } from "./providers/subscription-provider.js";
import { TimeController } from "./time-controller.js";

export interface TestEnvironmentProps {
  /**
   * A service name which will be used as the service name in the given {@link TestEnvironment}.
   *
   * @default testing
   */
  serviceName?: string;
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
 *
 * // start a workflow
 * await env.startExecution(workflow, input);
 *
 * // manually progress time
 * await env.tick();
 * ```
 */
export class TestEnvironment extends RuntimeServiceClient {
  private executionHistoryStore: ExecutionHistoryStore;
  private executionStore: ExecutionStore;

  private timerClient: TimerClient;
  private workflowClient: WorkflowClient;
  private eventClient: EventClient;
  private activityClient: ActivityClient;

  private activityProvider: MockableActivityProvider;
  private eventHandlerProvider: TestSubscriptionProvider;

  private timeController: TimeController<
    WorkflowTask | TimerRequest | ActivityWorkerRequest
  >;

  private orchestrator: Orchestrator;
  private timerHandler: TimerHandler;
  private activityWorker: ActivityWorker;

  private localEnvConnector: LocalEnvConnector;

  constructor(props?: TestEnvironmentProps) {
    const start = props?.start
      ? new Date(props.start.getTime() - props.start.getMilliseconds())
      : new Date(0);

    const timeController = new TimeController<
      WorkflowTask | TimerRequest | ActivityWorkerRequest
    >([], {
      // start the time controller at the given start time or Date(0)
      start: start.getTime(),
      // increment by seconds
      increment: 1000,
    });
    const localEnvConnector: LocalEnvConnector = {
      pushWorkflowTask: (task) => timeController.addEventAtNextTick(task),
      scheduleEvent: (time, task) =>
        timeController.addEvent(time.getTime(), task),
      getTime: () => this.time,
    };

    const executionHistoryStore = new LocalExecutionHistoryStore();
    const executionHistoryStateStore = new LocalExecutionHistoryStateStore();
    const activityStore = new LocalActivityStore();
    const executionStore = new LocalExecutionStore(localEnvConnector);

    const activityProvider = new MockableActivityProvider();
    const eventHandlerProvider = new TestSubscriptionProvider();

    const testLogAgent = new LogAgent({
      logsClient: new LocalLogsClient(),
      getTime: () => this.time,
      logLevel: { default: LogLevel.DEBUG },
    });

    const eventHandlerWorker = createSubscriptionWorker({
      // break the circular dependence on the worker and client by making the client optional in the worker
      // need to call registerEventClient before calling the handler.
      subscriptionProvider: eventHandlerProvider,
    });

    // TODO, update this to support mocking workflows.
    const workflowProvider = new GlobalWorkflowProvider();

    const executionQueueClient = new LocalExecutionQueueClient(
      localEnvConnector
    );
    const timerClient = new LocalTimerClient(localEnvConnector);
    const eventClient = new LocalEventClient(eventHandlerWorker);
    const workflowClient = new WorkflowClient(
      executionStore,
      new LocalLogsClient(),
      executionQueueClient,
      workflowProvider,
      () => this.time
    );

    const activityClient = new LocalActivityClient(localEnvConnector, {
      executionStore,
      executionQueueClient,
      activityStore,
    });

    super({
      activityClient,
      eventClient,
      executionHistoryStore,
      workflowClient,
      executionHistoryStateStore,
      executionQueueClient,
      executionStore,
      workflowProvider,
    });

    this.activityWorker = createActivityWorker({
      activityStore,
      eventClient,
      timerClient,
      metricsClient: new LocalMetricsClient(),
      executionQueueClient,
      activityProvider,
      logAgent: testLogAgent,
      serviceName: props?.serviceName ?? "testing",
    });

    this.executionStore = executionStore;
    this.executionHistoryStore = executionHistoryStore;

    this.eventHandlerProvider = eventHandlerProvider;
    this.activityProvider = activityProvider;

    this.timeController = timeController;

    this.workflowClient = workflowClient;
    this.eventClient = eventClient;
    this.timerClient = timerClient;
    this.activityClient = activityClient;

    this.localEnvConnector = localEnvConnector;

    const commandExecutor = new CommandExecutor({
      activityClient,
      eventClient,
      executionQueueClient,
      timerClient,
      workflowClient,
    });

    this.orchestrator = createOrchestrator({
      commandExecutor,
      executionHistoryStore: this.executionHistoryStore,
      executorProvider: new InMemoryExecutorProvider(),
      logAgent: testLogAgent,
      serviceName: props?.serviceName ?? "testing",
      timerClient: this.timerClient,
      workflowClient: this.workflowClient,
      workflowProvider,
    });

    this.timerHandler = createTimerHandler({
      activityStore,
      executionQueueClient,
      logAgent: testLogAgent,
      timerClient,
    });

    registerServiceClient(this);
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
  public mockActivity<A extends Activity<any, any>>(
    activity: A | string,
    resolution?:
      | ActivityOutput<A>
      | ((input: ActivityInput<A>) => ActivityOutput<A>)
  ): MockActivity<A> {
    return this.activityProvider.mockActivity(activity, resolution);
  }

  /**
   * Provides an environment local handler for an event.
   *
   * Note: this does not override other handlers for the same event.
   *       use {@link disableServiceSubscriptions} to turn off handlers
   *       included with the service or {@link resetTestSubscriptions}
   *       to clear handlers added via this method.
   */
  public subscribeEvents<E extends Event<any>>(
    events: E[],
    handler: SubscriptionHandler<EventPayloadType<E>>
  ) {
    return this.eventHandlerProvider.subscribeEvents(events, handler);
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
    return this.executionStore.get(executionId);
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
  public async sendActivitySuccess<A extends Activity<any, any> = any>(
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
    await this.activityClient.sendFailure(request);
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
  private async processTickEvents(
    events: (WorkflowTask | TimerRequest | ActivityWorkerRequest)[]
  ) {
    const timerRequests = events.filter(isTimerRequest);
    const workflowTasks = events.filter(isWorkflowTask);
    const activityWorkerRequests = events.filter(isActivityWorkerRequest);

    const [activityResults] = await Promise.all([
      Promise.all(
        activityWorkerRequests.map((request) =>
          this.activityWorker(
            request,
            this.localEnvConnector.getTime(),
            // end time is the start time plus one second
            (start) => new Date(start.getTime() + 1000)
          )
        )
      ),
      Promise.all(timerRequests.map((request) => this.timerHandler(request))),
      this.orchestrator(workflowTasks),
    ]);

    activityResults
      .filter(
        (r): r is ActivitySendEventRequest =>
          !!r && isActivitySendEventRequest(r)
      )
      .forEach((request) =>
        this.localEnvConnector.pushWorkflowTask({
          events: [request.event],
          executionId: request.executionId,
        })
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
