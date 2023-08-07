import {
  isChildWorkflowCall,
  type ChildWorkflowCall,
  type GetExecutionCall,
  type StartWorkflowCall,
} from "@eventual/core/internal";
import type { WorkflowClient } from "../../clients/workflow-client.js";
import { formatChildExecutionName } from "../../execution.js";
import {
  EventualWorkflowExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";

export class WorkflowClientWorkflowCallExecutor
  implements EventualWorkflowExecutor<ChildWorkflowCall>
{
  constructor(private workflowClient: WorkflowClient) {}

  /**
   * TODO: support {@link GetExecutionCall} and {@link StartWorkflowCall}.
   */
  public async executeForWorkflow(
    call: ChildWorkflowCall,
    { executionId, seq }: WorkflowExecutorInput
  ): Promise<void> {
    if (isChildWorkflowCall(call)) {
      await this.workflowClient.startExecution({
        workflow: call.name,
        input: call.input,
        parentExecutionId: executionId,
        executionName: formatChildExecutionName(executionId, seq),
        seq,
        ...call.opts,
      });
    }
  }
}
