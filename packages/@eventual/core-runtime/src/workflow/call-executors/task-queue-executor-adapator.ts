import {
  EventualCall,
  EventualCallOutput,
  WorkflowInputEvent,
} from "@eventual/core/internal";
import {
  EventualWorkflowExecutor,
  WorkflowExecutorInput,
} from "../call-executor.js";
import { EventualExecutor } from "../../eventual-hook.js";
import { ExecutionQueueClient } from "../../clients/execution-queue-client.js";

/**
 * Turn an {@link EventualExecutor} into an {@link EventualWorkflowExecutor}.
 *
 * Provide onSuccess and onFailure to map the client results to {@link WorkflowInputEvent}s.
 *
 * These events will then be sent to the {@link ExecutionQueueClient} to be consumed by the orchestrator.
 */
export class WorkflowTaskQueueExecutorAdaptor<
  E extends EventualCall,
  Ex extends EventualExecutor<E>
> implements EventualWorkflowExecutor<E>
{
  constructor(
    private executor: Ex,
    private executionQueueClient: ExecutionQueueClient,
    private onSuccess: (
      call: E,
      result: EventualCallOutput<E>,
      props: WorkflowExecutorInput
    ) => WorkflowInputEvent | Promise<WorkflowInputEvent>,
    private onFailure: (
      call: E,
      error: Error,
      props: WorkflowExecutorInput
    ) => WorkflowInputEvent | Promise<WorkflowInputEvent>
  ) {}

  public async executeForWorkflow(
    call: E,
    props: WorkflowExecutorInput
  ): Promise<void> {
    let event: WorkflowInputEvent;
    try {
      const result = await this.executor.execute(call);
      event = await this.onSuccess(call, result, props);
    } catch (err) {
      event = await this.onFailure(call, err as Error, props);
    }
    await this.executionQueueClient.submitExecutionEvents(
      props.executionId,
      event
    );
  }
}
