import type {
  DurationSchedule,
  CommandSpec,
  Subscription,
} from "@eventual/core";
import type { SchemaObject } from "openapi3-ts";

export interface BuildManifest {
  orchestrator: BundledFunction;
  activities: {
    default: BundledFunction;
    handlers: {
      [activityName: string]: BundledFunction;
    };
  };
  events: {
    /**
     * Open API 3 schema definitions for all known Events in this Service.
     */
    schemas: {
      [eventName: string]: SchemaObject;
    };
    /**
     * The catch-all function for any event handlers that cannot be bundled individually.
     */
    default: EventFunction;
    /**
     * Individually bundled {@link EventFunction}s containing a single `onEvent` event handler.
     */
    handlers: ExportedEventHandlerFunction[];
  };
  api: {
    default: BundledFunction;
    routes: ApiRoutes;
    internal: InternalApiRoutes;
  };
  scheduler: {
    forwarder: BundledFunction;
    timerHandler: BundledFunction;
  };
}

export interface ApiRoutes {
  [route: string]: ApiFunction;
}

export interface InternalApiRoutes {
  "/_eventual/workflows": InternalApiFunction;
  "/_eventual/workflows/{name}/executions": InternalApiFunction;
  "/_eventual/executions": InternalApiFunction;
  "/_eventual/executions/{executionId}": InternalApiFunction;
  "/_eventual/executions/{executionId}/history": InternalApiFunction;
  "/_eventual/executions/{executionId}/signals": InternalApiFunction;
  "/_eventual/executions/{executionId}/workflow-history": InternalApiFunction;
  "/_eventual/events": InternalApiFunction;
  "/_eventual/activities": InternalApiFunction;
}

export interface BundledFunction {
  name?: string;
  file: string;
  memorySize?: number;
  timeout?: DurationSchedule;
}

export interface ExportedEventHandlerFunction extends EventFunction {
  exportName: string;
}

export interface EventFunction extends BundledFunction {
  exportName?: string;
  subscriptions: Subscription[];
  retryAttempts?: number;
}

export interface InternalApiFunction extends Omit<ApiFunction, "exportName"> {}

export interface ApiFunction extends BundledFunction {
  exportName: string;
  command: CommandSpec;
}
