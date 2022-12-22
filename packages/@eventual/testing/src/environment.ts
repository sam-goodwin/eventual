import {
  ActivityArguments,
  ActivityFunction,
  ActivityOutput,
  createOrchestrator,
  EventClient,
  EventualError,
  ExecutionHistoryClient,
  ExecutionStatus,
  extendsError,
  Failed,
  groupBy,
  HeartbeatTimeout,
  Resolved,
  Result,
  ServiceType,
  SERVICE_TYPE_FLAG,
  Timeout,
  TimerClient,
  Workflow,
  WorkflowClient,
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

  private started: boolean = false;
  private timeController: TimeController<WorkflowTask>;

  public executions: Record<string, Execution<any>> = {};

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
    const timeConnector: TimeConnector = {
      pushEvent: (task) => this.timeController.addEventAtNext(task),
      scheduleEvent: (time, task) =>
        this.timeController.addEvent(
          time.getTime() - this.time.getTime(),
          task
        ),
      time: this.time,
    };
    const executionStore = new ExecutionStore();
    this.executionHistoryClient = new TestExecutionHistoryClient();
    this.workflowRuntimeClient = new TestWorkflowRuntimeClient(
      executionStore,
      timeConnector
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

  reset() {
    this.timeController.reset();
  }

  mockActivity<A extends ActivityFunction<any, any>>(activity: A) {
    return new MockActivity<A>(activity);
  }

  async startExecution<W extends Workflow<any, any> = any>(
    workflowName: string,
    input: WorkflowInput<W>
  ): Promise<Execution<W>>;
  async startExecution<W extends Workflow<any, any> = Workflow<any, any>>(
    workflow: W,
    input: WorkflowInput<W>
  ): Promise<Execution<W>>;
  async startExecution<W extends Workflow<any, any> = Workflow<any, any>>(
    workflow: W | string,
    input: WorkflowInput<W>
  ): Promise<Execution<W>> {
    const workflowName =
      typeof workflow === "string" ? workflow : workflow.workflowName;

    const executionId = await this.workflowClient.startWorkflow({
      workflowName: workflowName,
      input,
    });

    // tick forward on explicit user action (triggering the workflow to start running)
    await this.tick();

    const execution = new Execution(
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
   * TODO: Support ticking more than 1 step at a time, in batches.
   */
  async tick(n?: number) {
    if (n === undefined || n === 1) {
      const events = this.timeController.tick();
      await this.processTickEvents(events);
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
  get time(): Date;
}

export interface IMockActivity<
  Arguments extends any[] = any[],
  Output extends any = any
> {
  block(): IMockActivity<Arguments, Output>;
  blockOnce(): IMockActivity<Arguments, Output>;
  complete(output: Output): IMockActivity<Arguments, Output>;
  completeOnce(output: Output): IMockActivity<Arguments, Output>;
  fail(error: Error): IMockActivity<Arguments, Output>;
  fail(error: string, message: string): IMockActivity<Arguments, Output>;
  failOnce(error: Error): IMockActivity<Arguments, Output>;
  failOnce(error: string, message: string): IMockActivity<Arguments, Output>;
  invoke(
    handler: (...args: Arguments) => Promise<Output> | Output
  ): IMockActivity<Arguments, Output>;
  invokeOnce(
    handler: (...args: Arguments) => Promise<Output> | Output
  ): IMockActivity<Arguments, Output>;
  timeout(): IMockActivity<Arguments, Output>;
  timeoutOnce(): IMockActivity<Arguments, Output>;
  heartbeatTimeout(): IMockActivity<Arguments, Output>;
  heartbeatTimeoutOnce(): IMockActivity<Arguments, Output>;
  invokeReal(): IMockActivity<Arguments, Output>;
  invokeRealOnce(): IMockActivity<Arguments, Output>;
}

export class Execution<W extends Workflow<any, any>> {
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
    const execution = await this.environment.workflowClient.getExecution(
      this.id
    );
    if (execution?.status === ExecutionStatus.IN_PROGRESS) {
      throw new InProgressError("Workflow is still in progress");
    } else if (execution?.status === ExecutionStatus.FAILED) {
      throw new EventualError(execution.error, execution.message);
    } else {
      return execution?.result;
    }
  }
  async tryGetResult(): Promise<
    | { status: ExecutionStatus.IN_PROGRESS }
    | { status: ExecutionStatus.COMPLETE; result: WorkflowOutput<W> }
    | { status: ExecutionStatus.FAILED; error: string; message?: string }
  > {
    try {
      const result = await this.result();
      return { status: ExecutionStatus.COMPLETE, result };
    } catch (err) {
      if (err instanceof InProgressError) {
        return {
          status: ExecutionStatus.IN_PROGRESS,
        };
      } else if (extendsError(err)) {
        return {
          status: ExecutionStatus.FAILED,
          error: err.name,
          message: err.message,
        };
      }
    }
    return { status: ExecutionStatus.FAILED, error: "Error" };
  }
}

type ActivityResolution<
  Arguments extends any[] = any[],
  Output extends any = any
> =
  | BlockResolution
  | Failed
  | InvokeRealResolution
  | InvokeResolution<Arguments, Output>
  | Resolved<any>;

interface InvokeResolution<
  Arguments extends any[] = any[],
  Output extends any = any
> {
  handler: (...args: Arguments) => Promise<Output> | Output;
}

interface InvokeRealResolution {
  real: true;
}

interface BlockResolution {
  block: true;
}

export class MockActivity<A extends ActivityFunction<any, any>>
  implements IMockActivity<ActivityArguments<A>, ActivityOutput<A>>
{
  private resolutionsBefore: ActivityResolution<
    ActivityArguments<A>,
    ActivityOutput<A>
  >[] = [];
  private resolution:
    | ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
    | undefined;

  constructor(private activity: A) {}

  // TODO move and rename and finish
  call(...args: ActivityArguments<A>) {
    const before = this.resolutionsBefore.pop();
    if (before) {
    } else if (this.resolution) {
      if ("real" in this.resolution) {
        return this.activity(args);
      }
    }
    return undefined;
  }

  public complete(
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addResolution(Result.resolved(output));
  }
  public completeOnce(
    output: ActivityOutput<A>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addOnceResolution(Result.resolved(output));
  }
  public fail(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.addResolution(Result.failed(error));
  }
  public failOnce(...args: [error: Error] | [error: string, message: string]) {
    const error =
      args.length === 1 ? args[0] : new EventualError(args[0], args[1]);
    return this.addOnceResolution(Result.failed(error));
  }
  public timeout() {
    return this.addResolution(Result.failed(new Timeout()));
  }
  public timeoutOnce() {
    return this.addOnceResolution(Result.failed(new Timeout()));
  }
  public heartbeatTimeout() {
    return this.addResolution(Result.failed(new Timeout()));
  }
  public heartbeatTimeoutOnce() {
    return this.addOnceResolution(Result.failed(new HeartbeatTimeout()));
  }
  invoke(
    handler: (
      ...args: ActivityArguments<A>
    ) => ActivityOutput<A> | Promise<ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addResolution({ handler });
  }
  invokeOnce(
    handler: (
      ...args: ActivityArguments<A>
    ) => ActivityOutput<A> | Promise<ActivityOutput<A>>
  ): IMockActivity<ActivityArguments<A>, ActivityOutput<A>> {
    return this.addOnceResolution({ handler });
  }
  public invokeReal() {
    return this.addResolution({ real: true });
  }
  public invokeRealOnce() {
    return this.addOnceResolution({ real: true });
  }
  public block() {
    return this.addResolution({ block: true });
  }
  public blockOnce() {
    return this.addOnceResolution({ block: true });
  }

  private addResolution(
    resolution: ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
  ) {
    this.resolution = resolution;
    return this;
  }

  private addOnceResolution(
    resolution: ActivityResolution<ActivityArguments<A>, ActivityOutput<A>>
  ) {
    this.resolutionsBefore.push(resolution);
    return this;
  }
}
