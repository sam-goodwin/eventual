import { QueueCall, isQueueOperationOfType } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { QueueClient } from "../clients/queue-client.js";

export class QueueCallExecutor implements CallExecutor<QueueCall> {
  constructor(private queueClient: QueueClient) {}
  public execute(call: QueueCall) {
    const operation = call.operation;
    if (isQueueOperationOfType("sendMessage", operation)) {
      return this.queueClient.sendMessage(operation);
    } else if (isQueueOperationOfType("sendMessageBatch", operation)) {
      return this.queueClient.sendMessageBatch(operation);
    }
    return this.queueClient[operation.operation](
      call.operation.queueName,
      // @ts-ignore
      ...call.params
    );
  }
}
