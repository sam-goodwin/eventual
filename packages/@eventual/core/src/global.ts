import type { Eventual, EventualCallCollector } from "./eventual.js";
import type { WorkflowClient } from "./runtime/clients/workflow-client.js";
import type { Workflow } from "./workflow.js";

export const workflows = (): Map<string, Workflow> =>
  ((globalThis as any).workflows ??= new Map<string, Workflow>());

export const callableActivities = (): Record<string, Function> =>
  ((globalThis as any).callableActivities ??= {});

const eventualCollector = (): EventualCallCollector => {
  const collector = (globalThis as any).eventualCollector;
  if (!collector) {
    throw new Error("No Eventual Collector Provided");
  }
  return collector;
};

export function registerEventual<A extends Eventual>(eventual: A): A {
  return eventualCollector().pushEventual(eventual);
}

export function setEventualCollector(collector: EventualCallCollector) {
  (globalThis as any).eventualCollector = collector;
}

export function clearEventualCollector() {
  (globalThis as any).eventualCollector = undefined;
}

export function resetActivityCollector() {
  (globalThis as any).activityCollector = [];
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
