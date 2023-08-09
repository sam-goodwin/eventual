import { QueueCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import { QueueClient } from "../clients/queue-client.js";

export class QueueCallExecutor implements CallExecutor<QueueCall> {
  constructor(private queueClient: QueueClient) {}
  public execute(call: QueueCall): Promise<void> {
    return this.queueClient[call.operation](
      call.queueName,
      // @ts-ignore
      ...call.params
    );
  }
}
