import type { HttpMethod } from "./api.js";
import type { Subscription } from "./event.js";
import type { DurationSchedule } from "./schedule.js";

/**
 * Specification for an Eventual application
 */
export interface ServiceSpec {
  /**
   * A list of all event {@link Subscription}s.
   */
  subscriptions: Subscription[];
  api: ApiSpec;
  /**
   * List of workflows
   */
  workflows: WorkflowSpec[];
}

export interface ApiSpec {
  routes: RouteSpec[];
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export interface RouteSpec extends FunctionSpec {
  path: string;
  method: HttpMethod;
  sourceLocation?: SourceLocation;
}

export interface SourceLocation {
  fileName?: string;
  exportName?: string;
}

export interface WorkflowSpec {
  name: string;
}
