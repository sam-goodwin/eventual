import { Timeout } from "@eventual/core";
import { Result, type ExpectSignalCall } from "@eventual/core/internal";
import type { EventualFactory } from "../call-eventual-factory.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";

/**
 * {@link ExpectSignalCall} is a {@link Call} that waits for a {@link Signal} to be received.
 *
 * It uses the {@link NoOpWorkflowExecutor} and then waits for a signal to be received, resolving the payload or timeout promise.
 */
export class ExpectSignalFactory implements EventualFactory<ExpectSignalCall> {
  public createEventualDefinition(
    call: ExpectSignalCall
  ): EventualDefinition<void> {
    return {
      triggers: [
        Trigger.onSignal(call.signalId, (event) =>
          Result.resolved(event.payload)
        ),
        call.timeout
          ? Trigger.onPromiseResolution(
              call.timeout,
              Result.failed(new Timeout("Expect Signal Timed Out"))
            )
          : undefined,
      ],
    };
  }
}
