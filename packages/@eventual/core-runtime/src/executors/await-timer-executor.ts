import { AwaitTimerCall } from "@eventual/core/internal";
import { EventualExecutor } from "../eventual-hook.js";

/**
 * Support Await Timer calls outside of a workflow.
 *
 * @see AwaitTimerWorkflowExecutor for the workflow implementation.
 *
 * We'll just return the duration or timer object.
 */
export class AwaitTimerCallPassthroughExecutor
  implements EventualExecutor<AwaitTimerCall>
{
  public execute(call: AwaitTimerCall): Promise<void> {
    // looks weird, but is intentional
    return call.schedule as unknown as Promise<void>;
  }
}
