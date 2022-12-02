import type { Eventual } from "./eventual.js";
import type { WorkflowClient } from "./runtime/workflow-client.js";
import type { Workflow } from "./workflow.js";

const activityCollector = (): Eventual[] =>
  ((globalThis as any).activityCollector ??= []);

export const workflows = (): Map<string, Workflow> =>
  ((globalThis as any).workflows ??= new Map<string, Workflow>());

export const callableActivities = (): Record<string, Function> =>
  ((globalThis as any).callableActivities ??= {});

export function registerActivity<A extends Eventual>(activity: A): A {
  activityCollector().push(activity);
  return activity;
}

export function resetActivityCollector() {
  (globalThis as any).activityCollector = [];
}

export function collectActivities(): Eventual[] {
  const activities = activityCollector();
  resetActivityCollector();
  return activities;
}

// a global variable for storing the WorkflowClient
// this is initialized by Eventual's harness lambda functions
let workflowClient: WorkflowClient;

/**
 * Register the global workflow client used by workflow functions
 * to start workflows within an eventual-controlled environment.
 */
export function registerWorkflowClient(client: WorkflowClient) {
  workflowClient = client;
}

/**
 * Get the global workflow client.
 */
export function getWorkflowClient(): WorkflowClient {
  if (workflowClient === undefined) {
    throw new Error(`WorkflowClient is not registered`);
  }
  return workflowClient;
}
