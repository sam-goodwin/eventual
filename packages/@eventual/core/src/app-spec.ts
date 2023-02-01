import type { HttpMethod } from "./api.js";
import type { Subscription } from "./event.js";
import type { DurationSchedule } from "./schedule.js";

/**
 * Specification for an Eventual application
 */
export interface AppSpec {
  /**
   * A list of all event {@link Subscription}s.
   */
  subscriptions: Subscription[];
  api: ApiSpec;
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
