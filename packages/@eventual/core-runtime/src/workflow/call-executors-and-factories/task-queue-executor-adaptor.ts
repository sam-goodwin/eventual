import {
  WorkflowInputEvent,
  type Call,
  type CallOutput,
} from "@eventual/core/internal";
import type { CallExecutor } from "../../call-executor.js";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import type {
  WorkflowCallExecutor,
  WorkflowCallExecutorProps,
} from "../call-executor.js";

/**
 * Turn an {@link CallExecutor} into an {@link WorkflowCallExecutor}.
 *
 * Provide onSuccess and onFailure to map the client results to {@link WorkflowInputEvent}s.
 *
 * These events will then be sent to the {@link ExecutionQueueClient} to be consumed by the orchestrator.
 */
export class WorkflowTaskQueueExecutorAdaptor<
  E extends Call,
  Ex extends CallExecutor<E>
> implements WorkflowCallExecutor<E>
{
  constructor(
    private executor: Ex,
    private executionQueueClient: ExecutionQueueClient,
    private onSuccess: (
      call: E,
      result: Awaited<CallOutput<E>>,
      props: WorkflowCallExecutorProps
    ) => WorkflowInputEvent | Promise<WorkflowInputEvent>,
    private onFailure: (
      call: E,
      error: Error,
      props: WorkflowCallExecutorProps
    ) => WorkflowInputEvent | Promise<WorkflowInputEvent>
  ) {}

  public async executeForWorkflow(
    call: E,
    props: WorkflowCallExecutorProps
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
