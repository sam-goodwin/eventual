import {
  createEvent,
  HistoryStateEvent,
  SendSignalRequest,
  SignalReceived,
  WorkflowEventType,
  WorkflowTask,
} from "@eventual/core";
export abstract class ExecutionQueueClient {
  constructor(private baseTime: () => Date) {}

  public abstract submitExecutionEvents(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void>;

  public async sendSignal(request: SendSignalRequest): Promise<void> {
    const executionId =
      typeof request.execution === "string"
        ? request.execution
        : request.execution.executionId;
    await this.submitExecutionEvents(
      executionId,
      createEvent<SignalReceived>(
        {
          type: WorkflowEventType.SignalReceived,
          payload: request.payload,
          signalId:
            typeof request.signal === "string"
              ? request.signal
              : request.signal.id,
        },
        this.baseTime(),
        request.id
      )
    );
  }
}

export interface ExecutionQueueEventEnvelope {
  task: WorkflowTask;
}
