import { HistoryStateEvent } from "@eventual/core";
import { ExecutionQueueClient } from "@eventual/runtime-core";
import { TimeConnector } from "../environment.js";

export class TestExecutionQueueClient extends ExecutionQueueClient {
  constructor(private timeConnector: TimeConnector) {
    super(() => timeConnector.getTime());
  }

  public async submitExecutionEvents(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void> {
    this.timeConnector.pushEvent({ executionId, events });
  }
}
