//@ts-ignore
import workflow from "@eventual/injected/workflow";

import {
  HistoryStateEvents,
  progressWorkflow,
  ProgressWorkflowResult,
} from "@eventual/core";

export type Orchestrator = typeof orchestrator;

/**
 * Orchestrator for local execution. Runs the imported transformed workflow against a provided history
 * @param historyEvents history to replay the workflow against
 * @returns Workflow progress
 */
export function orchestrator(
  historyEvents: HistoryStateEvents[]
): ProgressWorkflowResult {
  return progressWorkflow(
    workflow,
    historyEvents,
    [],
    { name: "local" },
    "local"
  );
}
