import type { EventHandler, Subscription } from "./event.js";
import type { HttpMethod } from "./http/method.js";
import type { DurationSchedule } from "./schedule.js";
import type { SchemaObject } from "openapi3-ts";

/**
 * Specification for an Eventual application
 */
export interface AppSpec {
  api: ApiSpec;
  events: EventSpec;
}

export interface EventSpec {
  /**
   * Schemas of all events within this Service.
   */
  schemas: Schemas;
  /**
   * Catch-all default subscriptions and route to the default Event Handler monolith.
   */
  subscriptions: Subscription[];
  /**
   * Individually bundled and subscribed event Event Handlers.
   */
  handlers: EventHandlerSpec[];
}

export interface EventHandlerSpec extends Omit<EventHandler, "handler"> {
  // source location is mandatory for individually bundled event handlers.
  sourceLocation: SourceLocation;
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

export function isSourceLocation(a: any) {
  return (
    a &&
    typeof a === "object" &&
    typeof a.fileName === "string" &&
    typeof a.exportName === "string"
  );
}

export interface SourceLocation {
  fileName: string;
  exportName: string;
}

export interface Schemas {
  [schemaName: string]: SchemaObject;
}
