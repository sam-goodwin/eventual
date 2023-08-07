import { TaskCall } from "@eventual/core/internal";
import {
  WorkflowCallExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";
import { TaskClient, TaskWorkerRequest } from "../../clients/task-client.js";

export class ScheduleTaskWorkflowExecutor
  implements WorkflowCallExecutor<TaskCall>
{
  constructor(private taskClient: TaskClient) {}
  public async executeForWorkflow(
    call: TaskCall,
    { executionTime, workflow, executionId, seq }: WorkflowExecutorInput
  ): Promise<any> {
    const request: TaskWorkerRequest = {
      scheduledTime: executionTime.toISOString(),
      workflowName: workflow.name,
      executionId,
      input: call.input,
      taskName: call.name,
      seq,
      heartbeat: call.heartbeat,
      retry: 0,
    };

    await this.taskClient.startTask(request);
  }
}
