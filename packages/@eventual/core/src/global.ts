import { ActivityContext, ActivityHandler } from "./activity.js";
import type { Eventual, EventualCallCollector } from "./eventual.js";
import type { WorkflowClient } from "./runtime/clients/workflow-client.js";
import type { Workflow } from "./workflow.js";

declare global {
  /**
   * Data about the current activity assigned before running an activity on an the activity worker.
   */
  var activityContext: ActivityContext | undefined;
  /**
   * An object used by the interpreter to collect {@link Eventual}s while running a workflow code.
   *
   * Set by the interpreter only when needed.
   */
  var eventualCollector: EventualCallCollector | undefined;
  /**
   * Callable activities which register themselves in an activity worker.
   */
  var callableActivities: Record<string, ActivityHandler<any>>;
  /**
   * Available workflows which have registered themselves.
   *
   * Used by the orchestrator, activity worker, and other scopes to interact with workflows in
   * a service.
   */
  var workflows: Map<string, Workflow>;
}

export const workflows = (): Map<string, Workflow> =>
  (globalThis.workflows ??= new Map<string, Workflow>());

export const callableActivities = (): Record<string, ActivityHandler<any>> =>
  (globalThis.callableActivities ??= {});

const eventualCollector = (): EventualCallCollector => {
  const collector = globalThis.eventualCollector;
  if (!collector) {
    throw new Error("No Eventual Collector Provided");
  }
  return collector;
};

export function registerEventual<A extends Eventual>(eventual: A): A {
  return eventualCollector().pushEventual(eventual);
}

export function setEventualCollector(collector: EventualCallCollector) {
  globalThis.eventualCollector = collector;
}

export function clearEventualCollector() {
  globalThis.eventualCollector = undefined;
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

export function setActivityContext(context: ActivityContext) {
  globalThis.activityContext = context;
}

export function getActivityContext(): ActivityContext {
  const context = globalThis.activityContext;

  if (!context) {
    throw new Error(
      "Activity Context has not been registered yet or this is not the activity worker."
    );
  }
  return context;
}
