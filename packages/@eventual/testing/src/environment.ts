import {
  ActivityArguments,
  ActivityFunction,
  ActivityOutput,
  Command,
  EventualError,
  ExecutionStatus,
  Failed,
  HeartbeatTimeout,
  HistoryStateEvent,
  interpret,
  Resolved,
  Result,
  ServiceType,
  SERVICE_TYPE_FLAG,
  Timeout,
  Workflow,
  WorkflowInput,
  WorkflowOutput,
  workflows,
} from "@eventual/core";
import { bundleService } from "@eventual/compiler";

export interface TestEnvironmentProps {
  entry: string;
  outDir: string;
  start?: Date;
}

export class TestEnvironment {
  private serviceFile: Promise<string>;

  constructor(props: TestEnvironmentProps) {
    this.serviceFile = bundleService(
      props.outDir,
      props.entry,
      ServiceType.OrchestratorWorker,
      ["@eventual/core"]
    );
  }

  mockActivity<A extends ActivityFunction<any, any>>(activity: A) {
    return new MockActivity<A>(activity);
  }

  async startExecution<W extends Workflow<any, any> = Workflow<any, any>>(
    workflow: W,
    input: WorkflowInput<W>
  ): Promise<Execution<W>> {
    // clear any registed workflows
    const _workflows = workflows();
    _workflows.clear();
    // run the service to re-import the workflows, but transformed
    await import(await this.serviceFile);
    // get the same workflow from the updated workflows.
    const updatedWorkflow = _workflows.get(workflow.workflowName);
    // definition is internal only
    const back = process.env[SERVICE_TYPE_FLAG];
    process.env[SERVICE_TYPE_FLAG] = ServiceType.OrchestratorWorker;
    const start = interpret((<any>updatedWorkflow).definition(input, {}), []);
    process.env[SERVICE_TYPE_FLAG] = back;

    console.log(start);

    return {
      history: [],
      commands: start.commands,
      status: ExecutionStatus.IN_PROGRESS,
    };
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
  history: HistoryStateEvent[];
  commands: Command[];
  status: ExecutionStatus;
  result?: WorkflowOutput<W>;
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
