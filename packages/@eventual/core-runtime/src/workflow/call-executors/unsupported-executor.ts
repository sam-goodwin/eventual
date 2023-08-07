import {
  EventualCallKind,
  EventualCallSymbol,
  type EventualCall,
} from "@eventual/core/internal";
import {
  EventualWorkflowExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";

export class UnsupportedWorkflowCallExecutor
  implements EventualWorkflowExecutor
{
  public async executeForWorkflow(
    _call: EventualCall,
    _props: WorkflowExecutorInput
  ) {
    throw new Error(
      `Call type ${
        EventualCallKind[_call[EventualCallSymbol]]
      } is not supported by the workflow executor.`
    );
  }
}
