import { assertNever, type SignalHandlerCall } from "@eventual/core/internal";
import type {
  EventualFactory,
  ResolveEventualFunction,
} from "../call-eventual-factory.js";
import { Trigger, type EventualDefinition } from "../eventual-definition.js";
import { Result } from "../../result.js";

/**
 * {@link SignalHandlerCall} has no remote execution, it waits for the signal it is subscribed to and calls the in memory handler when it is received.
 */
export class RegisterSignalHandlerCallFactory
  implements EventualFactory<SignalHandlerCall>
{
  public initializeEventual(
    call: SignalHandlerCall<any>,
    resolveEventual: ResolveEventualFunction
  ): EventualDefinition<void> {
    const operation = call.operation;
    if (operation.operation === "register") {
      return {
        triggers: Trigger.onSignal(operation.signalId, (event) => {
          operation.handler(event.payload);
        }),
      };
    } else if (operation.operation === "dispose") {
      resolveEventual(operation.seq, Result.resolved(undefined));
      return { result: Result.resolved(undefined) };
    }
    assertNever(operation);
  }
}
