import type { ActivitySpec } from "@eventual/core";
import type {
  CommandSpec,
  EventSpec,
  SubscriptionSpec
} from "@eventual/core/internal";

export interface BuildManifest {
  /**
   * Activities declared within the Service.
   */
  activities: ActivityFunction[];
  /**
   * The events and their schema.
   */
  events: EventSpec[];
  /**
   * All subscriptions to events declared within the service.
   */
  subscriptions: SubscriptionFunction[];
  commands: CommandFunction[];
  system: {
    activityService: {
      fallbackHandler: BundledFunction<undefined>;
    };
    eventualService: {
      commands: InternalApiRoutes;
    };
    schedulerService: {
      forwarder: BundledFunction;
      timerHandler: BundledFunction;
    };
    workflowService: {
      orchestrator: BundledFunction;
    };
  };
}

export interface ApiRoutes {
  [route: string]: CommandFunction;
}

export interface InternalApiRoutes {
  "/_eventual/workflows": InternalCommandFunction;
  "/_eventual/workflows/{name}/executions": InternalCommandFunction;
  "/_eventual/executions": InternalCommandFunction;
  "/_eventual/executions/{executionId}": InternalCommandFunction;
  "/_eventual/executions/{executionId}/history": InternalCommandFunction;
  "/_eventual/executions/{executionId}/signals": InternalCommandFunction;
  "/_eventual/executions/{executionId}/workflow-history": InternalCommandFunction;
  "/_eventual/events": InternalCommandFunction;
  "/_eventual/activities": InternalCommandFunction;
}

export type BundledFunction<Spec = undefined> = {
  entry: string;
  /**
   * Export name of the handler in the file.
   *
   * @default index.default
   */
  handler?: string;
} & ([Spec] extends [object] ? { spec: Spec } : { spec?: never });

export interface ExportedEventHandlerFunction extends SubscriptionFunction {
  exportName: string;
}

export interface SubscriptionFunction
  extends BundledFunction<SubscriptionSpec> {}

export interface ActivityFunction extends BundledFunction<ActivitySpec> {}

export interface InternalCommandFunction extends CommandFunction {
  spec: CommandFunction["spec"] & {};
}

export interface CommandFunction extends BundledFunction<CommandSpec> {}
