import { ExecutionHistoryClient, WorkflowEvent } from "@eventual/core";

export class TestExecutionHistoryClient extends ExecutionHistoryClient {
  private eventStore: Record<string, WorkflowEvent[]> = {};

  public async putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void> {
    this.putEvents(executionId, [event]);
  }

  public async putEvents(
    executionId: string,
    events: WorkflowEvent[]
  ): Promise<void> {
    (this.eventStore[executionId] ??= []).push(...events);
  }

  public async getEvents(executionId: string): Promise<WorkflowEvent[]> {
    return this.eventStore[executionId] ?? [];
  }
}
