import { Subscription } from "./event.js";
import { DurationSchedule } from "./schedule.js";

/**
 * Specification for an Eventual application
 */
export interface AppSpec {
  /**
   * A list of all event {@link Subscription}s.
   */
  subscriptions: Subscription[];

  api: {
    routes: RouteSpec[];
  };
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export interface RouteSpec extends FunctionSpec {
  path: string;
  sourceLocation?: SourceLocation;
}

export interface SourceLocation {
  /**
   * @internal - only available during eventual-infer
   */
  fileName?: string;
  /**
   * @internal - only available during eventual-infer
   */
  exportName?: string;
}
