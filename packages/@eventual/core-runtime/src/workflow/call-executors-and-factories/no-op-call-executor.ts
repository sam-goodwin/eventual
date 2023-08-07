import type { Call } from "@eventual/core/internal";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";

export class NoOpWorkflowExecutor implements WorkflowCallExecutor {
  public async executeForWorkflow(
    _call: Call,
    _props: WorkflowCallExecutorProps
  ) {
    return undefined;
  }
}
