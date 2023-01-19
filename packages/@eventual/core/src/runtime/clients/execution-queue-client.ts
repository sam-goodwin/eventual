import { ExecutionHandle } from "../../execution.js";
import { Signal } from "../../signals.js";
import { WorkflowTask } from "../../tasks.js";
import {
  createEvent,
  HistoryStateEvent,
  SignalReceived,
  WorkflowEventType,
} from "../../workflow-events.js";

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

export interface SendSignalRequest<Payload = any> {
  execution: ExecutionHandle<any> | string;
  signal: string | Signal<Payload>;
  payload?: Payload;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id?: string;
}
