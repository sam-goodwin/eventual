import { CallKind, CallSymbol, type Call } from "@eventual/core/internal";
import {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";

export class UnsupportedWorkflowCallExecutor implements WorkflowCallExecutor {
  public async executeForWorkflow(
    _call: Call,
    _props: WorkflowCallExecutorProps
  ) {
    throw new Error(
      `Call type ${
        CallKind[_call[CallSymbol]]
      } is not supported by the workflow executor.`
    );
  }
}
