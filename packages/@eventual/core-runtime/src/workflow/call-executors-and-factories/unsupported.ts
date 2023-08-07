import { CallKind, CallSymbol, type Call } from "@eventual/core/internal";
import { type EventualFactory } from "../call-eventual-factory.js";
import { type WorkflowCallExecutor } from "../call-executor.js";

export class UnsupportedWorkflowCallExecutor implements WorkflowCallExecutor {
  public async executeForWorkflow(call: Call) {
    throw new Error(
      `Call type ${
        CallKind[call[CallSymbol]]
      } is not supported by the workflow executor.`
    );
  }
}

export class UnsupportedEventualFactory implements EventualFactory {
  public createEventualDefinition(call: Call): any {
    throw new Error(
      `Call type ${
        CallKind[call[CallSymbol]]
      } is not supported by the workflow executor.`
    );
  }
}
