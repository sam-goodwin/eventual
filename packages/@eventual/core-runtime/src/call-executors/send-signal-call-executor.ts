import {
  CallOutput,
  SendSignalCall,
  isChildExecutionTarget,
} from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";

export class SendSignalCallExecutor implements CallExecutor<SendSignalCall> {
  constructor(private executionQueueClient: ExecutionQueueClient) {}

  public execute(call: SendSignalCall): Promise<CallOutput<SendSignalCall>> {
    if (isChildExecutionTarget(call.target)) {
      throw new Error(
        "Cannot signal to child execution targets outside of a workflow"
      );
    }
    const childExecutionId = call.target.executionId;

    return this.executionQueueClient.sendSignal({
      signal: call.signalId,
      execution: childExecutionId,
      id: call.id,
      payload: call.payload,
    });
  }
}
