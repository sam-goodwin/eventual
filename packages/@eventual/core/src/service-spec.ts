import type openapi from "openapi3-ts";
import type { z } from "zod";
import type { EventHandler, Subscription } from "./event.js";
import type { Command } from "./http/command.js";
import type { DurationSchedule } from "./schedule.js";

/**
 * Specification for an Eventual application
 */
export interface ServiceSpec {
  api: ApiSpec;
  events: EventSpec;
  /**
   * List of workflows
   */
  workflows: WorkflowSpec[];
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
  commands: CommandSpec[];
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export type CommandSpec = Omit<ToSpec<Command>, "kind">;

type ToSpec<T> = T extends z.ZodType
  ? openapi.SchemaObject
  : T extends (infer I)[]
  ? ToSpec<I>[]
  : T extends Record<string, any>
  ? {
      [prop in keyof DropFunctions<T>]: ToSpec<T[prop]>;
    }
  : T;

type DropFunctions<T> = Pick<T, KeysNotOfType<T, (...args: any[]) => any>>;

type KeysNotOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? never : k;
}[keyof T];

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
  [schemaName: string]: openapi.SchemaObject;
}

export interface WorkflowSpec {
  name: string;
}
