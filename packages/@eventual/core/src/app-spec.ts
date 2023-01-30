import { Subscription } from "./event.js";

export interface WorkflowSpec {
  name: string;
}

/**
 * Specification for an Eventual application
 */
export interface AppSpec {
  /**
   * A list of all event {@link Subscription}s.
   */
  subscriptions: Subscription[];
  /**
   * List of workflows
   */
  workflows: WorkflowSpec[];
}
