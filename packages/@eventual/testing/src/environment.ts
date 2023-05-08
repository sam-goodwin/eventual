import { inferFromMemory } from "@eventual/compiler";
import {
  Event,
  EventEnvelope,
  EventPayload,
  EventPayloadType,
  ExecutionHandle,
  SendSignalRequest,
  SendTaskFailureRequest,
  SendTaskHeartbeatRequest,
  SendTaskHeartbeatResponse,
  SendTaskSuccessRequest,
  StartExecutionRequest,
  SubscriptionHandler,
  Task,
  TaskOutput,
  Workflow,
} from "@eventual/core";
import {
  bucketHandlerMatchesEvent,
  entityStreamMatchesItem,
  isBucketNotificationEvent,
  isEntityStreamItem,
  isTaskSendEventRequest,
  isTaskWorkerRequest,
  isTimerRequest,
  isWorkflowTask,
  LocalContainer,
  LocalEnvConnector,
  LocalEvent,
  RuntimeServiceClient,
  TimeController,
  WorkflowTask,
} from "@eventual/core-runtime";
import {
  buckets,
  EmitEventsRequest,
  entities,
  registerEnvironmentManifest,
  registerServiceClient,
  TaskInput,
} from "@eventual/core/internal";
import { TestSubscriptionProvider } from "./providers/subscription-provider.js";
import { MockableTaskProvider, MockTask } from "./providers/task-provider.js";

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
 * Supports providing mock implementations of tasks and workflow,
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
 *
 * TODO: support mocking workflows.
 */
export class TestEnvironment extends RuntimeServiceClient {
  private localContainer: LocalContainer;
  private localEnvConnector: LocalEnvConnector;
  private timeController: TimeController<LocalEvent>;

  private taskProvider: MockableTaskProvider;
  private subscriptionProvider: TestSubscriptionProvider;

  constructor(props?: TestEnvironmentProps) {
    const start = props?.start
      ? new Date(props.start.getTime() - props.start.getMilliseconds())
      : new Date(0);

    const timeController = new TimeController<LocalEvent>([], {
      // start the time controller at the given start time or Date(0)
      start: start.getTime(),
      // increment by seconds
      increment: 1000,
    });

    const taskProvider = new MockableTaskProvider();
    const subscriptionProvider = new TestSubscriptionProvider();

    const localEnvConnector: LocalEnvConnector = {
      pushWorkflowTaskNextTick: (task) =>
        this.timeController.addEventAtNextTick(task),
      pushWorkflowTask: (task) =>
        this.timeController.addEvent(this.timeController.currentTick, task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(time.getTime(), task),
      getTime: () => this.time,
    };

    const serviceName = props?.serviceName ?? "testing";
    const serviceUrl = "unknown";

    const localContainer = new LocalContainer(localEnvConnector, {
      serviceName,
      serviceUrl,
      taskProvider,
      subscriptionProvider,
    });

    super({
      taskClient: localContainer.taskClient,
      eventClient: localContainer.eventClient,
      executionHistoryStateStore: localContainer.executionHistoryStateStore,
      executionHistoryStore: localContainer.executionHistoryStore,
      executionQueueClient: localContainer.executionQueueClient,
      executionStore: localContainer.executionStore,
      workflowClient: localContainer.workflowClient,
      workflowProvider: localContainer.workflowProvider,
      transactionClient: localContainer.transactionClient,
    });

    this.timeController = timeController;
    this.localEnvConnector = localEnvConnector;
    this.localContainer = localContainer;

    this.taskProvider = taskProvider;
    this.subscriptionProvider = subscriptionProvider;

    registerServiceClient(this);
    registerEnvironmentManifest({
      serviceSpec: inferFromMemory({
        info: { title: "test-service", version: "1" },
      }),
      // TODO: support a local endpoint for local testing
      serviceUrl,
      serviceName,
    });
  }

  public override async sendTaskHeartbeat(
    request: SendTaskHeartbeatRequest
  ): Promise<SendTaskHeartbeatResponse> {
    const resp = await super.sendTaskHeartbeat(request);
    await this.tick();
    return resp;
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
    this.taskProvider.clearMocks();
  }

  /**
   * Removes all test event subscriptions.
   */
  public resetTestSubscriptions() {
    this.subscriptionProvider.clearTestHandlers();
  }

  /**
   * Overrides the implementation of a task with a mock.
   *
   * ```ts
   * const mockTask = env.mockTask(myTask);
   * mockTask.succeed("hello"); // myTask will return "hello" when invoked until the mock is reset or a new resolution is given.
   * ```
   */
  public mockTask<A extends Task<any, any>>(
    task: A | string,
    resolution?: TaskOutput<A> | ((input: TaskInput<A>) => TaskOutput<A>)
  ): MockTask<A> {
    return this.taskProvider.mockTask(task, resolution);
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
    return this.subscriptionProvider.subscribeEvents(events, handler);
  }

  /**
   * Turn off all of the event handlers registered by the service.
   */
  public disableServiceSubscriptions() {
    this.subscriptionProvider.disableDefaultSubscriptions();
  }

  /**
   * Turn on all of the event handlers in the service.
   */
  public enableServiceSubscriptions() {
    this.subscriptionProvider.enableDefaultSubscriptions();
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
   * Emits one or more events of a type into the {@link TestEnvironment}.
   * and progresses time by one second ({@link tick})
   */
  public async emitEvent<Payload extends EventPayload = EventPayload>(
    event: string | Event<Payload>,
    ...payloads: Payload[]
  ) {
    await this.emitEvents({
      events: payloads.map(
        (p): EventEnvelope<Payload> => ({
          name: typeof event === "string" ? event : event.name,
          event: p,
        })
      ),
    });
    return this.tick();
  }

  /**
   * Emits one or more events into the {@link TestEnvironment}
   * and progresses time by one second ({@link tick})
   */
  public override async emitEvents(request: EmitEventsRequest) {
    await super.emitEvents(request);
    return this.tick();
  }

  /**
   * Starts a workflow execution and
   * progresses time by one second ({@link tick})
   */
  public override async startExecution<W extends Workflow = Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    const execution = await super.startExecution<W>(request);
    // tick forward on explicit user action (triggering the workflow to start running)
    await this.tick();

    return execution;
  }

  /**
   * Succeeds a task with a result value
   * and progressed time by one second ({@link tick}).
   *
   * Get the task token by intercepting the token from {@link asyncResult}.
   *
   * ```ts
   * let taskToken;
   * mockTask.asyncResult(token => taskToken);
   * // start workflow
   * env.sendTaskSuccess(taskToken, "value");
   * ```
   */
  public override async sendTaskSuccess<A extends Task<any, any> = any>(
    request: Omit<SendTaskSuccessRequest<TaskOutput<A>>, "type">
  ) {
    await super.sendTaskSuccess(request);
    return this.tick();
  }

  /**
   * Fails a task with a result value
   * and progressed time by one second ({@link tick}).
   *
   * Get the task token by intercepting the token from {@link asyncResult}.
   *
   * ```ts
   * let taskToken;
   * mockTask.asyncResult(token => taskToken);
   * // start workflow
   * env.sendTaskFailure(taskToken, "value");
   * ```
   */
  public override async sendTaskFailure(
    request: Omit<SendTaskFailureRequest, "type">
  ) {
    await super.sendTaskFailure(request);
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
      const nextTick = this.timeController.nextTick;
      let events = this.timeController.tickUntil(nextTick);
      do {
        await this.processTickEvents(events);
        events = this.timeController.tickUntil(nextTick);
      } while (events.length > 0);
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
  private async processTickEvents(events: LocalEvent[]) {
    const timerRequests = events.filter(isTimerRequest);
    const workflowTasks = events.filter(isWorkflowTask);
    const taskWorkerRequests = events.filter(isTaskWorkerRequest);
    const entityStreamItems = events.filter(isEntityStreamItem);
    const bucketNotificationEvents = events.filter(isBucketNotificationEvent);

    await Promise.all(
      // run all task requests, don't wait for a result
      [
        ...taskWorkerRequests.map(async (request) => {
          const result = await this.localContainer.taskWorker(
            request,
            this.localEnvConnector.getTime(),
            () => this.localEnvConnector.getTime()
          );
          if (!!result && isTaskSendEventRequest(result)) {
            this.localEnvConnector.pushWorkflowTaskNextTick({
              events: [result.event],
              executionId: result.executionId,
            });
          }
        }),
        entityStreamItems.flatMap((i) => {
          const streamNames = [...entities().values()]
            .flatMap((d) => d.streams)
            .filter((s) => entityStreamMatchesItem(i, s))
            .map((s) => s.name);
          return streamNames.map((streamName) => {
            return this.localContainer.entityStreamWorker({
              ...i,
              streamName,
            });
          });
        }),
        bucketNotificationEvents.flatMap((i) => {
          const streamNames = [...buckets().values()]
            .flatMap((d) => d.handlers)
            .filter((s) => bucketHandlerMatchesEvent(i, s))
            .map((s) => s.name);
          return streamNames.map((streamName) => {
            return this.localContainer.bucketHandlerWorker({
              ...i,
              handlerName: streamName,
            });
          });
        }),
        // run all timer requests, don't wait for a result
        ...timerRequests.map((request) =>
          this.localContainer.timerHandler(request)
        ),
        // run the orchestrator, but wait for a result.
        this.localContainer.orchestrator(workflowTasks, () =>
          this.localEnvConnector.getTime()
        ),
      ]
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
