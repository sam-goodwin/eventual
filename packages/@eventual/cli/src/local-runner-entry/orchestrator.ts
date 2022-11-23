//@ts-ignore
import workflow from "@eventual/injected/workflow";
import {
  HistoryStateEvents,
  progressWorkflow,
  WorkflowContext,
  ProgressWorkflowResult,
} from "@eventual/core";

export type Orchestrator = typeof orchestrator;

export function orchestrator(
  historyEvents: HistoryStateEvents[],
  taskEvents: HistoryStateEvents[],
  workflowContext: WorkflowContext
): ProgressWorkflowResult {
  return progressWorkflow(
    workflow,
    historyEvents,
    taskEvents,
    workflowContext,
    "local"
  );
}
