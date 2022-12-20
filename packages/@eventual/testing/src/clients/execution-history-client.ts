import { ExecutionHistoryClient, WorkflowEvent } from "@eventual/core";

export class TestExecutionHistoryClient extends ExecutionHistoryClient {
  private eventStore: Record<string, WorkflowEvent[]> = {};

  async putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void> {
    this.putEvents(executionId, [event]);
  }
  async putEvents(executionId: string, events: WorkflowEvent[]): Promise<void> {
    if (!(executionId in this.eventStore)) {
      this.eventStore[executionId] = [];
    }
    this.eventStore[executionId]!.push(...events);
  }
  async getEvents(executionId: string): Promise<WorkflowEvent[]> {
    return this.eventStore[executionId] ?? [];
  }
}
