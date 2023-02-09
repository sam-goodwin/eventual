import type openapi from "openapi3-ts";
import type { z } from "zod";
import type { Event, EventHandler } from "./event.js";
import type { Command } from "./http/command.js";
import type { DurationSchedule } from "./schedule.js";
import type { ActivityFunction } from "./activity.js";

/**
 * Specification for an Eventual application
 */
export interface ServiceSpec {
  /**
   * List of workflows
   */
  workflows: WorkflowSpec[];
  activities: {
    [activityName: string]: ActivitySpec;
  };
  commands: {
    /**
     * Default Route for handling a catch-all, e.g. returning 404
     *
     * Each command should be bundled in its own lambda function but we continue this catch-all just in case
     * for the API Gateway's default integration.
     *
     * TODO: consider removing.
     */
    default: CommandSpec;
    /**
     * Individually bundled and tree-shaken functions for a specific Command.
     */
    [commandName: string]: CommandSpec;
  };
  events: {
    /**
     * Open API 3 schema definitions for all known Events in this Service.
     */
    [eventName: string]: EventSpec;
  };
  subscriptions: {
    /**
     * The catch-all function for any event handlers that cannot be bundled individually.
     */
    default: SubscriptionSpec;
    /**
     * Individually bundled {@link EventFunction}s containing a single `onEvent` event handler.
     */
    [subscriptionName: string]: SubscriptionSpec;
  };
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export type ActivitySpec = ToSpec<ActivityFunction>;

export type SubscriptionSpec = Omit<ToSpec<EventHandler>, "kind">;

export type EventSpec = Omit<ToSpec<Event>, "kind">;

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
