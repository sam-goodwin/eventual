import { ExecutionQueueClient, HistoryStateEvent } from "@eventual/core";
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
