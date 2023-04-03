import type { WorkflowInputEvent } from "@eventual/core/internal";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { LocalEnvConnector } from "../local-container.js";

export class LocalExecutionQueueClient extends ExecutionQueueClient {
  constructor(private envConnector: LocalEnvConnector) {
    super(() => envConnector.getTime());
  }

  public async submitExecutionEvents(
    executionId: string,
    ...events: WorkflowInputEvent[]
  ): Promise<void> {
    this.envConnector.pushWorkflowTaskNextTick({ executionId, events });
  }
}
