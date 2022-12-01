import { clearEventualCollector, getWorkflowClient } from "./global.js";
import type { Program } from "./interpret.js";
import type { Context, WorkflowContext } from "./context.js";
import { DeterminismError } from "./error.js";
import {
  filterEvents,
  HistoryStateEvent,
  isHistoryEvent,
  isSleepCompleted,
  isSleepScheduled,
  isWorkflowStarted,
  SleepCompleted,
  SleepScheduled,
  WorkflowEventType,
} from "./events.js";
import { interpret, WorkflowResult } from "./interpret.js";
import type { StartWorkflowResponse } from "./runtime/workflow-client.js";
import { ChildExecution, createWorkflowCall } from "./calls/workflow-call.js";
import { AwaitedEventual } from "./eventual.js";

export const INTERNAL_EXECUTION_ID_PREFIX = "##EVENTUAL##";

export type WorkflowHandler<Input = any, Output = any> = (
  input: Input,
  context: Context
) => Promise<Output> | Program<Output>;

export interface StartExecutionRequest<Input> {
  /**
   * Input payload for the workflow.
   */
  input: Input;
  /**
   * Optional name of the workflow to start - used to determine the unique ID and enforce idempotency.
   *
   * @default - a unique ID is generated.
   */
  name?: string;
}

export type WorkflowOutput<W extends Workflow<any, any>> = W extends Workflow<
  any,
  infer Out
>
  ? Out
  : never;

export type WorkflowInput<W extends Workflow<any, any>> = W extends Workflow<
  infer In,
  any
>
  ? In
  : never;

/**
 * A {@link Workflow} is a long-running process that orchestrates calls
 * to other services in a durable and observable way.
 */
export interface Workflow<Input = any, Output = any> {
  /**
   * Globally unique ID of this {@link Workflow}.
   */
  workflowName: string;
  /**
   * Invokes the {@link Workflow} from within another workflow.
   *
   * This can only be called from within another workflow because it's not possible
   * to wait for completion synchronously - it relies on the event-driven environment
   * of a workflow execution.
   *
   * To start a workflow from another environment, use {@link start}.
   */
  (input: Input): Promise<Output> & ChildExecution;

  /**
   * Starts a workflow execution
   */
  startExecution(
    request: StartExecutionRequest<Input>
  ): Promise<StartWorkflowResponse>;

  /**
   * @internal - this is the internal DSL representation that produces a {@link Program} instead of a Promise.
   */
  definition: (
    input: Input,
    context: Context
  ) => Program<AwaitedEventual<Output>>;
}

const workflows = new Map<string, Workflow>();

export function lookupWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

/**
 * Creates and registers a long-running workflow.
 *
 * Example:
 * ```ts
 * import { activity, workflow } from "@eventual/core";
 *
 * export default workflow("my-workflow", async ({ name }: { name: string }) => {
 *   const result = await hello(name);
 *   console.log(result);
 *   return `you said ${result}`;
 * });
 *
 * const hello = activity("hello", async (name: string) => {
 *   return `hello ${name}`;
 * });
 * ```
 * @param name a globally unique ID for this workflow.
 * @param definition the workflow definition.
 */
export function workflow<Input = any, Output = any>(
  name: string,
  definition: WorkflowHandler<Input, Output>
): Workflow<Input, Output> {
  if (workflows.has(name)) {
    throw new Error(`workflow with name '${name}' already exists`);
  }
  const workflow: Workflow<Input, Output> = ((input?: any) =>
    createWorkflowCall(name, input)) as any;

  workflow.workflowName = name;

  workflow.startExecution = async function (input) {
    return {
      executionId: await getWorkflowClient().startWorkflow({
        workflowName: name,
        executionName: input.name,
        input: input.input,
      }),
    };
  };

  workflow.definition = definition as Workflow<Input, Output>["definition"]; // safe to cast because we rely on transformer (it is always the generator API)
  workflows.set(name, workflow);
  return workflow;
}

export interface ProgressWorkflowResult extends WorkflowResult {
  history: HistoryStateEvent[];
}

/**
 * Advance a workflow using previous history, new events, and a program.
 */
export function progressWorkflow(
  program: Workflow,
  historyEvents: HistoryStateEvent[],
  taskEvents: HistoryStateEvent[],
  workflowContext: WorkflowContext,
  executionId: string
): ProgressWorkflowResult {
  // historical events and incoming events will be fed into the workflow to resume/progress state
  const inputEvents = filterEvents<HistoryStateEvent>(
    historyEvents,
    taskEvents
  );

  // Generates events that are time sensitive, like sleep completed events.
  const syntheticEvents = generateSyntheticEvents(inputEvents);

  const allEvents = [...inputEvents, ...syntheticEvents];

  const startEvent = inputEvents.find(isWorkflowStarted);

  if (!startEvent) {
    throw new DeterminismError(
      `No ${WorkflowEventType.WorkflowStarted} found.`
    );
  }

  const context: Context = {
    workflow: workflowContext,
    execution: {
      ...startEvent.context,
      id: executionId,
      startTime: startEvent.timestamp,
    },
  };

  // execute workflow
  const interpretEvents = allEvents.filter(isHistoryEvent);

  console.debug("history events", JSON.stringify(historyEvents));
  console.debug("task events", JSON.stringify(taskEvents));
  console.debug("synthetic events", JSON.stringify(syntheticEvents));
  console.debug("interpret events", JSON.stringify(interpretEvents));

  try {
    return {
      ...interpret(
        program.definition(startEvent.input, context),
        interpretEvents
      ),
      history: allEvents,
    };
  } catch (err) {
    // temporary fix when the interpreter fails, but the activities are not cleared.
    clearEventualCollector();
    throw err;
  }
}

/**
 * Generates synthetic events, for example, {@link SleepCompleted} events when the time has passed, but a real completed event has not come in yet.
 */
export function generateSyntheticEvents(
  events: HistoryStateEvent[]
): SleepCompleted[] {
  const unresolvedSleep: Record<number, SleepScheduled> = {};
  const now = new Date();

  const sleepEvents = events.filter(
    (event): event is SleepScheduled | SleepCompleted =>
      isSleepScheduled(event) || isSleepCompleted(event)
  );

  for (const event of sleepEvents) {
    if (isSleepScheduled(event)) {
      unresolvedSleep[event.seq] = event;
    } else {
      delete unresolvedSleep[event.seq];
    }
  }

  const syntheticSleepComplete: SleepCompleted[] = Object.values(
    unresolvedSleep
  )
    .filter((event) => new Date(event.untilTime).getTime() <= now.getTime())
    .map(
      (e) =>
        ({
          type: WorkflowEventType.SleepCompleted,
          seq: e.seq,
          timestamp: now.toISOString(),
        } satisfies SleepCompleted)
    );

  return syntheticSleepComplete;
}
