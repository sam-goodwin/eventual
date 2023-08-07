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
  type EventualCallOutput,
  type GetExecutionCall,
  type InvokeTransactionCall,
  type SendSignalCall,
  type StartWorkflowCall,
  type TaskRequestCall,
} from "@eventual/core/internal";
import type { EventualExecutor } from "../eventual-hook.js";

type SupportEventualCall =
  | EmitEventsCall
  | GetExecutionCall
  | InvokeTransactionCall
  | SendSignalCall
  | StartWorkflowCall
  | TaskRequestCall;

export class ServiceClientExecutor
  implements EventualExecutor<SupportEventualCall>
{
  constructor(private serviceClient: EventualServiceClient) {}

  public async execute<C extends SupportEventualCall>(
    call: C
  ): Promise<EventualCallOutput<C>> {
    if (isSendSignalCall(call)) {
      if (call.target.type === SignalTargetType.ChildExecution) {
        throw new Error("Signal Target Child Workflow unsupported");
      }
      return this.serviceClient.sendSignal({
        execution: call.target.executionId,
        signal: call.signalId,
        id: call.id,
        payload: call.payload,
      }) as EventualCallOutput<C>;
    } else if (isTaskRequestCall(call)) {
      if (call.operation === "sendTaskSuccess") {
        return this.serviceClient.sendTaskSuccess(
          ...(call.params as [any])
        ) as EventualCallOutput<C>;
      } else if (call.operation === "sendTaskFailure") {
        return this.serviceClient.sendTaskFailure(
          ...(call.params as [any])
        ) as EventualCallOutput<C>;
      } else if (call.operation === "sendTaskHeartbeat") {
        return this.serviceClient.sendTaskHeartbeat(
          ...(call.params as [any])
        ) as EventualCallOutput<C>;
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
      }) as EventualCallOutput<C>;
    } else if (isStartWorkflowCall(call)) {
      return this.serviceClient.startExecution({
        workflow: call.name,
        input: call.input,
      }) as EventualCallOutput<C>;
    } else if (isGetExecutionCall(call)) {
      return this.serviceClient.getExecution(
        call.executionId
      ) as EventualCallOutput<C>;
    }

    return assertNever(call);
  }
}
