import { Call } from "@eventual/core/internal";
import {
  EventualWorkflowExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";

export class NoOpWorkflowExecutor implements EventualWorkflowExecutor {
  public async executeForWorkflow(_call: Call, _props: WorkflowExecutorInput) {
    return undefined;
  }
}
