import type { EventualServiceClient } from "@eventual/core";
import {
  SignalTargetType,
  assertNever,
  isSendSignalCall,
  isTaskRequestCall,
  type EventualCallOutput,
  type EventualPromise,
  type SendSignalCall,
  type TaskRequestCall,
} from "@eventual/core/internal";
import type { EventualExecutor } from "../eventual-hook.js";

type SupportEventualCall = SendSignalCall | TaskRequestCall;

export class ServiceClientExecutor
  implements EventualExecutor<SupportEventualCall>
{
  constructor(private serviceClient: EventualServiceClient) {}

  public execute<E extends SupportEventualCall>(
    call: E
  ): EventualPromise<EventualCallOutput<E>> {
    if (isSendSignalCall(call)) {
      if (call.target.type === SignalTargetType.ChildExecution) {
        throw new Error("Signal Target Child Workflow unsupported");
      }
      return this.serviceClient.sendSignal({
        execution: call.target.executionId,
        signal: call.signalId,
        id: call.id,
        payload: call.payload,
      }) as any as EventualPromise<EventualCallOutput<E>>;
    } else if (isTaskRequestCall(call)) {
      if (call.operation === "sendTaskSuccess") {
        return this.serviceClient.sendTaskSuccess(
          ...(call.params as [any])
        ) as any as EventualPromise<EventualCallOutput<E>>;
      } else if (call.operation === "sendTaskFailure") {
        return this.serviceClient.sendTaskFailure(
          ...(call.params as [any])
        ) as any as EventualPromise<EventualCallOutput<E>>;
      } else if (call.operation === "sendTaskHeartbeat") {
        return this.serviceClient.sendTaskHeartbeat(
          ...(call.params as [any])
        ) as any as EventualPromise<EventualCallOutput<E>>;
      }
      assertNever(call.operation);
    }

    return assertNever(call);
  }
}
