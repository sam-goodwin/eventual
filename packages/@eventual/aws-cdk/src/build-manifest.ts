import type {
  DurationSchedule,
  HttpMethod,
  Subscription,
} from "@eventual/core";

export interface BuildManifest {
  orchestrator: BundledFunction;
  activities: {
    default: BundledFunction;
    handlers: {
      [activityName: string]: BundledFunction;
    };
  };
  events: {
    default: EventFunction;
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

export interface EventFunction extends BundledFunction {
  subscriptions: Subscription[];
}

export interface ApiFunction extends BundledFunction {
  methods: HttpMethod[];
}
