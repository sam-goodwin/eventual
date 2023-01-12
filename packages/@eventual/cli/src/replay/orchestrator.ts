import {
  Workflow,
  HistoryStateEvent,
  interpret,
  isWorkflowStarted,
  isHistoryEvent,
  runWorkflowDefinition,
} from "@eventual/core";

export type Orchestrator = typeof orchestrator;

/**
 * Orchestrator for local execution. Runs the imported transformed workflow against a provided history
 * @param historyEvents history to replay the workflow against
 * @returns Workflow progress
 */
export function orchestrator(
  executionId: string,
  workflow: Workflow,
  historyEvents: HistoryStateEvent[]
) {
  const startEvent = historyEvents.find(isWorkflowStarted);
  if (!startEvent) {
    throw new Error("Missing start event");
  }
  const interpretEvents = historyEvents.filter(isHistoryEvent);
  return interpret(
    runWorkflowDefinition(workflow, startEvent.input, {
      workflow: { name: workflow.name },
      execution: {
        ...startEvent.context,
        startTime: startEvent.timestamp,
        id: executionId,
      },
    }),
    interpretEvents
  );
}
