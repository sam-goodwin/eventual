import { QueueCall, isQueueOperationOfType } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import { QueueClient } from "../clients/queue-client.js";

export class QueueCallExecutor implements CallExecutor<QueueCall> {
  constructor(private queueClient: QueueClient) {}
  public execute(call: QueueCall): Promise<void> {
    const operation = call.operation;
    if (isQueueOperationOfType("sendMessage", operation)) {
      return this.queueClient.sendMessage(operation);
    }
    return this.queueClient[operation.operation](
      call.operation.queueName,
      // @ts-ignore
      ...call.params
    );
  }
}
