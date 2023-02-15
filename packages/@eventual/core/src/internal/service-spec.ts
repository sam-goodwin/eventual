import type openapi from "openapi3-ts";
import type { z } from "zod";
import type { Event } from "../event.js";
import type { Command } from "../http/command.js";
import type { DurationSchedule } from "../schedule.js";
import type { Activity } from "../activity.js";
import type {
  SubscriptionFilter,
  SubscriptionRuntimeProps,
} from "../subscription.js";

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
     * Individually bundled {@link EventFunction}s containing a single `onEvent` event handler.
     */
    [subscriptionName: string]: SubscriptionSpec;
  };
}

export interface FunctionSpec {
  memorySize?: number;
  timeout?: DurationSchedule;
}

export type ActivitySpec = Omit<ToSpec<Activity>, "kind">;

export interface SubscriptionSpec<Name extends string = string> {
  /**
   * Unique name of this Subscription.
   */
  name: Name;
  /**
   * Subscriptions this Event Handler is subscribed to. Any event flowing
   * through the Service's Event Bus that match these criteria will be
   * sent to this Lambda Function.
   */
  filters: SubscriptionFilter[];
  /**
   * Runtime configuration for this Event Handler.
   */
  props?: SubscriptionRuntimeProps;
  /**
   * Only available during eventual-infer.
   */
  sourceLocation?: SourceLocation;
}

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
  : T extends Event
  ? {
      name: T["name"];
    }
  : T;

type DropFunctions<T> = Pick<T, KeysNotOfType<T, (...args: any[]) => any>>;

type KeysNotOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? never : k;
}[keyof T];

export function isSourceLocation(a: any): a is SourceLocation {
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
