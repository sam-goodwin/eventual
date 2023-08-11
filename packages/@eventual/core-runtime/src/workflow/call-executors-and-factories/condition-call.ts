import type { ConditionCall } from "@eventual/core/internal";
import { Result } from "../../result.js";
import type { EventualFactory } from "../call-eventual-factory.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";

/**
 * {@link ConditionCall} has no remote execution, it calls the in synchronous memory predicate it is given and returns when the predicate is true or a timer goes off.
 */
export class ConditionCallEventualFactory
  implements EventualFactory<ConditionCall>
{
  public initializeEventual(call: ConditionCall): EventualDefinition<boolean> {
    // if the condition resolves immediately, just return a completed eventual
    const result = call.predicate();
    if (result) {
      return {
        result: Result.resolved(result),
      };
    } else {
      // otherwise check the state after every event is applied.
      return {
        triggers: [
          Trigger.afterEveryEvent(() => {
            const result = call.predicate();
            return result ? Result.resolved(result) : undefined;
          }),
          call.timeout
            ? Trigger.onPromiseResolution(call.timeout, Result.resolved(false))
            : undefined,
        ],
      };
    }
  }
}
