import { DeterminismError } from "./error.js";
import {
  HistoryStateEvents,
  isHistoryEvent,
  isWorkflowStarted,
  tryMergeEvents,
  WorkflowEventType,
} from "./events.js";
import { interpret, Program, WorkflowResult } from "./interpret.js";

interface ProgressWorkflowResult extends WorkflowResult {
  history: HistoryStateEvents[];
}

/**
 * Progress a workflow using previous history, new events, and a program.
 */
export function progressWorkflow(
  program: (input: any) => Program<any>,
  historyEvents: HistoryStateEvents[],
  taskEvents: HistoryStateEvents[]
): ProgressWorkflowResult {
  // historical events and incoming events will be fed into the workflow to resume/progress state
  const inputEvents = tryMergeEvents<HistoryStateEvents>(
    historyEvents,
    taskEvents
  );

  const startEvent = inputEvents.find(isWorkflowStarted);

  if (!startEvent) {
    throw new DeterminismError(
      `No ${WorkflowEventType.WorkflowStarted} found.`
    );
  }

  // execute workflow
  const interpretEvents = inputEvents.filter(isHistoryEvent);
  const input = JSON.parse(startEvent.input);
  return {
    ...interpret(program(input), interpretEvents),
    history: inputEvents,
  };
}
