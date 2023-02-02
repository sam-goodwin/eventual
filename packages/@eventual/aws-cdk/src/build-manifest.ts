import type {
  DurationSchedule,
  HttpMethod,
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
  "/_eventual/workflows": ApiFunction;
  "/_eventual/workflows/{name}/executions": ApiFunction;
  "/_eventual/executions": ApiFunction;
  "/_eventual/executions/{executionId}": ApiFunction;
  "/_eventual/executions/{executionId}/history": ApiFunction;
  "/_eventual/executions/{executionId}/signals": ApiFunction;
  "/_eventual/executions/{executionId}/workflow-history": ApiFunction;
  "/_eventual/events": ApiFunction;
  "/_eventual/activities": ApiFunction;
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

export interface ApiFunction extends BundledFunction {
  exportName?: string;
  methods: HttpMethod[];
}
