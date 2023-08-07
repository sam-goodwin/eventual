import { EventualError, type EventualServiceClient } from "@eventual/core";
import {
  SignalTargetType,
  assertNever,
  isEmitEventsCall,
  isGetExecutionCall,
  isInvokeTransactionCall,
  isSendSignalCall,
  isStartWorkflowCall,
  isTaskRequestCall,
  type EmitEventsCall,
  type CallOutput,
  type GetExecutionCall,
  type InvokeTransactionCall,
  type SendSignalCall,
  type StartWorkflowCall,
  type TaskRequestCall,
} from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";

type SupportEventualCall =
  | EmitEventsCall
  | GetExecutionCall
  | InvokeTransactionCall
  | SendSignalCall
  | StartWorkflowCall
  | TaskRequestCall;

/**
 * An executor which makes use of the common {@link EventualServiceClient} to execute {@link EventualCall}s.
 */
export class ServiceClientExecutor
  implements CallExecutor<SupportEventualCall>
{
  constructor(private serviceClient: EventualServiceClient) {}

  public async execute<C extends SupportEventualCall>(
    call: C
  ): Promise<CallOutput<C>> {
    if (isSendSignalCall(call)) {
      if (call.target.type === SignalTargetType.ChildExecution) {
        throw new Error("Signal Target Child Workflow unsupported");
      }
      return this.serviceClient.sendSignal({
        execution: call.target.executionId,
        signal: call.signalId,
        id: call.id,
        payload: call.payload,
      }) as CallOutput<C>;
    } else if (isTaskRequestCall(call)) {
      if (call.operation === "sendTaskSuccess") {
        return this.serviceClient.sendTaskSuccess(
          ...(call.params as [any])
        ) as CallOutput<C>;
      } else if (call.operation === "sendTaskFailure") {
        return this.serviceClient.sendTaskFailure(
          ...(call.params as [any])
        ) as CallOutput<C>;
      } else if (call.operation === "sendTaskHeartbeat") {
        return this.serviceClient.sendTaskHeartbeat(
          ...(call.params as [any])
        ) as CallOutput<C>;
      }
      assertNever(call.operation);
    } else if (isInvokeTransactionCall(call)) {
      const response = await this.serviceClient.executeTransaction({
        transaction: call.transactionName,
        input: call.input,
      });

      if (response.succeeded) {
        return response.output;
      } else {
        throw new EventualError(response.error, response.message);
      }
    } else if (isEmitEventsCall(call)) {
      return this.serviceClient.emitEvents({
        events: call.events,
      }) as CallOutput<C>;
    } else if (isStartWorkflowCall(call)) {
      return this.serviceClient.startExecution({
        workflow: call.name,
        input: call.input,
      }) as CallOutput<C>;
    } else if (isGetExecutionCall(call)) {
      return this.serviceClient.getExecution(call.executionId) as CallOutput<C>;
    }

    return assertNever(call);
  }
}
