import {
  ActivityRuntimeClient,
  Execution,
  ExecutionStatus,
  HistoryStateEvent,
  StartWorkflowRequest,
  Workflow,
  WorkflowClient,
} from "@eventual/core";
import { TestEnvironment } from "../environment.js";

export class TestWorkflowClient extends WorkflowClient {
  constructor(
    private env: TestEnvironment,
    activityRuntimeClient: ActivityRuntimeClient
  ) {
    super(activityRuntimeClient);
  }

  public async startWorkflow<W extends Workflow<any, any> = Workflow<any, any>>(
    request: StartWorkflowRequest<W>
  ): Promise<string> {
    const execution = await this.env.startExecution(
      request.workflowName,
      request.input
    );
    return execution.id;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void> {
    for (const event of events) {
      await this.env.progressWorkflow(executionId, event);
    }
  }

  public async getExecutions(_props: {
    statuses?: ExecutionStatus[] | undefined;
    workflowName?: string | undefined;
  }): Promise<Execution<any>[]> {
    throw new Error("Method not implemented.");
  }

  public getExecution(
    _executionId: string
  ): Promise<Execution<any> | undefined> {
    throw new Error("Method not implemented.");
  }
}
