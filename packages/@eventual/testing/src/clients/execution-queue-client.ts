import { ExecutionQueueClient } from "@eventual/core-runtime";
import type { WorkflowInputEvent } from "@eventual/core/internal";
import type { TimeConnector } from "../environment.js";

export class TestExecutionQueueClient extends ExecutionQueueClient {
  constructor(private timeConnector: TimeConnector) {
    super(() => timeConnector.getTime());
  }

  public async submitExecutionEvents(
    executionId: string,
    ...events: WorkflowInputEvent[]
  ): Promise<void> {
    this.timeConnector.pushEvent({ executionId, events });
  }
}
