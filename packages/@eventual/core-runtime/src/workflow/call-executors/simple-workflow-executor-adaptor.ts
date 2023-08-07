import { Call } from "@eventual/core/internal";
import { CallExecutor } from "../../eventual-hook.js";
import { EventualWorkflowExecutor } from "../call-executor.js";

/**
 * Turn any {@link CallExecutor} into an {@link EventualWorkflowExecutor}.
 *
 * Calls execute and then does nothing with the result. Useful for calls like {@link EmitEventsCall}.
 */
export class SimpleWorkflowExecutorAdaptor<C extends Call>
  implements EventualWorkflowExecutor<C>
{
  constructor(private executor: CallExecutor<C>) {}
  public async executeForWorkflow(call: C): Promise<void> {
    await this.executor.execute(call);
  }
}
