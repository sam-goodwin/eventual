import type { RegisterSignalHandlerCall } from "@eventual/core/internal";
import type { EventualFactory } from "../call-eventual-factory.js";
import { type EventualDefinition, Trigger } from "../eventual-definition.js";

/**
 * {@link RegisterSignalHandlerCall} has no remote execution, it waits for the signal it is subscribed to and calls the in memory handler when it is received.
 */
export class RegisterSignalHandlerCallFactory
  implements EventualFactory<RegisterSignalHandlerCall>
{
  public createEventualDefinition(
    call: RegisterSignalHandlerCall<any>
  ): EventualDefinition<void> {
    return {
      triggers: Trigger.onSignal(call.signalId, (event) => {
        call.handler(event.payload);
      }),
    };
  }
}
