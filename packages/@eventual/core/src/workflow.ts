import {
  AwaitedEventual,
  Eventual,
  EventualKind,
  EventualSymbol,
} from "./eventual.js";
import { registerActivity } from "./global.js";
import type { Program } from "./interpret.js";
import type { Result } from "./result.js";
import { Context, WorkflowContext } from "./context.js";
import { DeterminismError } from "./error.js";
import {
  filterEvents,
  HistoryStateEvents,
  isHistoryEvent,
  isWorkflowStarted,
  WorkflowEventType,
} from "./events.js";
import { interpret, WorkflowResult } from "./interpret.js";

export interface ExecutionHandle {
  /**
   * ID of the workflow execution.
   */
  executionId: string;
}

/**
 * A {@link Workflow} is a long-running process that orchestrates calls
 * to other services in a durable and observable way.
 */
export interface Workflow<
  F extends (...args: any[]) => any = (...args: any[]) => any
> {
  /**
   * Globally unique ID of this {@link Workflow}.
   */
  name: string;
  /**
   * Invokes the {@link Workflow} from within another workflow.
   *
   * This can only be called from within another workflow because it's not possible
   * to wait for completion synchronously - it relies on the event-driven environment
   * of a workflow execution.
   *
   * To start a workflow from another environment, use {@link start}.
   */
  (...args: Parameters<F>): ReturnType<F>;
  /**
   * Starts an execution of this {@link Workflow} without waiting for the response.
   *
   * @returns a {@link ExecutionHandle} with the `executionId`.
   */
  start(...args: Parameters<F>): Promise<ExecutionHandle>;
  /**
   * @internal - this is the internal DSL representation that produces a {@link Program} instead of a Promise.
   */
  definition: (
    ...args: Parameters<F>
  ) => Program<AwaitedEventual<ReturnType<F>>>;
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
export function workflow<F extends (input?: any) => Promise<any> | Program>(
  name: string,
  definition: F
): Workflow<F> {
  if (workflows.has(name)) {
    throw new Error(`workflow with name '${name}' already exists`);
  }
  const workflow: Workflow<F> = ((input?: any) =>
    registerActivity({
      [EventualSymbol]: EventualKind.WorkflowCall,
      name,
      input,
    })) as any;

  workflow.start = async function (..._args: Parameters<F>) {
    // TODO: get a client and submit execution
    throw new Error("not implemented");
  };
  workflow.definition = definition as Workflow<F>["definition"]; // safe to cast because we rely on transformer (it is always the generator API)
  workflows.set(name, workflow);
  return workflow;
}

export function isWorkflowCall<T>(a: Eventual<T>): a is WorkflowCall<T> {
  return a[EventualSymbol] === EventualKind.WorkflowCall;
}

/**
 * An {@link Eventual} representing an awaited call to a {@link Workflow}.
 */
export interface WorkflowCall<T = any> {
  [EventualSymbol]: EventualKind.WorkflowCall;
  name: string;
  input: any;
  result?: Result<T>;
  seq?: number;
}

export interface ProgressWorkflowResult extends WorkflowResult {
  history: HistoryStateEvents[];
}

/**
 * Advance a workflow using previous history, new events, and a program.
 */
export function progressWorkflow(
  program: Workflow,
  historyEvents: HistoryStateEvents[],
  taskEvents: HistoryStateEvents[],
  workflowContext: WorkflowContext,
  executionId: string
): ProgressWorkflowResult {
  // historical events and incoming events will be fed into the workflow to resume/progress state
  const inputEvents = filterEvents<HistoryStateEvents>(
    historyEvents,
    taskEvents
  );

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
  const interpretEvents = inputEvents.filter(isHistoryEvent);
  return {
    ...interpret(
      program.definition(startEvent.input, context),
      interpretEvents
    ),
    history: inputEvents,
  };
}
