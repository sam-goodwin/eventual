import { CallKind, CallSymbol, type Call } from "@eventual/core/internal";
import {
  EventualWorkflowExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";

export class UnsupportedWorkflowCallExecutor
  implements EventualWorkflowExecutor
{
  public async executeForWorkflow(_call: Call, _props: WorkflowExecutorInput) {
    throw new Error(
      `Call type ${
        CallKind[_call[CallSymbol]]
      } is not supported by the workflow executor.`
    );
  }
}
