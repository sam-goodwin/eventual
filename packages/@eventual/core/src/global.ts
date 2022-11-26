import type { Eventual } from "./eventual.js";
import type { WorkflowClient } from "./runtime/workflow-client.js";

export function registerActivity<A extends Eventual>(activity: A): A {
  activityCollector.push(activity);
  return activity;
}

let activityCollector: Eventual[] = [];

export function resetActivityCollector() {
  activityCollector = [];
}

export function collectActivities() {
  const activities = activityCollector;
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
