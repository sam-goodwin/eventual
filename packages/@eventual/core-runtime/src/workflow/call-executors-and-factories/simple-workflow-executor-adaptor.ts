import type { Call } from "@eventual/core/internal";
import type { CallExecutor } from "../../call-executor.js";
import type { WorkflowCallExecutor } from "../call-executor.js";

/**
 * Turn any {@link CallExecutor} into an {@link WorkflowCallExecutor}.
 *
 * Calls execute and then does nothing with the result. Useful for calls like {@link EmitEventsCall}.
 */
export class SimpleWorkflowExecutorAdaptor<C extends Call>
  implements WorkflowCallExecutor<C>
{
  constructor(private executor: CallExecutor<C>) {}
  public async executeForWorkflow(call: C): Promise<void> {
    await this.executor.execute(call);
  }
}
