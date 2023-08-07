import { Call } from "@eventual/core/internal";
import {
  WorkflowCallExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";

export class NoOpWorkflowExecutor implements WorkflowCallExecutor {
  public async executeForWorkflow(_call: Call, _props: WorkflowExecutorInput) {
    return undefined;
  }
}
