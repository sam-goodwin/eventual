import {
  ActivityArguments,
  ActivityFunction,
  ActivityOutput,
  createEvent,
  createOrchestrator,
  EventClient,
  EventualError,
  ExecutionHistoryClient,
  ExecutionID,
  Failed,
  formatExecutionId,
  HeartbeatTimeout,
  HistoryStateEvent,
  parseWorkflowName,
  Resolved,
  Result,
  ServiceType,
  SERVICE_TYPE_FLAG,
  Timeout,
  TimerClient,
  Workflow,
  WorkflowClient,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowInput,
  WorkflowOutput,
  WorkflowRuntimeClient,
  workflows,
  WorkflowStarted,
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

export interface TestEnvironmentProps {
  entry: string;
  outDir: string;
  start?: Date;
}

export class TestEnvironment {
  private serviceFile: Promise<string>;

  private timerClient: TimerClient;
  private workflowClient: WorkflowClient;
  private workflowRuntimeClient: WorkflowRuntimeClient;
  private executionHistoryClient: ExecutionHistoryClient;
  private eventClient: EventClient;

  private started: boolean = false;
  private time: Date;

  public executions: Record<string, Execution<any>> = {};

  constructor(props: TestEnvironmentProps) {
    this.serviceFile = bundleService(
      props.outDir,
      props.entry,
      ServiceType.OrchestratorWorker,
      ["@eventual/core"]
    );
    this.executionHistoryClient = new TestExecutionHistoryClient();
    this.workflowRuntimeClient = new TestWorkflowRuntimeClient();
    this.eventClient = new TestEventClient();
    this.workflowClient = new TestWorkflowClient(
      this,
      new TestActivityRuntimeClient()
    );
    this.timerClient = new TestTimerClient();
    this.time = props.start ?? new Date(0);
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

  private getWorkflow(workflowName: string): Workflow {
    if (!this.started) {
      throw new Error("Test Environment is not yet started.");
    }
    const workflow = workflows().get(workflowName);
    if (!workflow) {
      throw new Error("Workflow does not exist");
    }
    // TODO validate that the workflow is transpiled.
    return workflow;
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
    const executionId = formatExecutionId(workflowName, "test");
    await this.progressWorkflow(
      executionId,
      createEvent<WorkflowStarted>(
        {
          type: WorkflowEventType.WorkflowStarted,
          context: {
            name: "test",
          },
          workflowName,
          input,
        },
        this.time
      )
    );

    const execution = {
      id: executionId,
      history: () => this.workflowRuntimeClient.getHistory(executionId),
    };

    this.executions[executionId] = execution;

    return execution;
  }

  async progressWorkflow(executionId: string, event: HistoryStateEvent) {
    const orchestrator = this.createOrchestrator();

    const workflowName = parseWorkflowName(executionId as ExecutionID);
    const workflow = this.getWorkflow(workflowName);

    const back = process.env[SERVICE_TYPE_FLAG];
    process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
    await orchestrator.orchestrateExecution(workflow, executionId, [event]);
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

export interface Execution<W extends Workflow<any, any>> {
  id: string;
  history: () => Promise<WorkflowEvent[]>;
  result?: Promise<WorkflowOutput<W>>;
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
