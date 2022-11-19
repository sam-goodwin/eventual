import { Context, WorkflowContext } from "./context.js";
import { DeterminismError } from "./error.js";
import {
  filterEvents,
  HistoryStateEvents,
  isHistoryEvent,
  isWorkflowStarted,
  WorkflowEventType,
} from "./events.js";
import { EventualFunction } from "./eventual.js";
import { interpret, Program, WorkflowResult } from "./interpret.js";

interface ProgressWorkflowResult extends WorkflowResult {
  history: HistoryStateEvents[];
}

/**
 * A function which starts the {@link Program} generator with input and {@link Context}.
 */
export type ProgramStarter = EventualFunction<Program<any>>;

/**
 * Progress a workflow using previous history, new events, and a program.
 */
export function progressWorkflow(
  program: ProgramStarter,
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
    ...interpret(program(startEvent.input, context), interpretEvents),
    history: inputEvents,
  };
}
