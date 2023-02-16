import type {
  CommandSpec,
  EventSpec,
  SubscriptionSpec,
} from "@eventual/core/internal";
import { ActivitySpec } from "@eventual/core/src/activity";

export interface BuildManifest {
  workflows: {
    orchestrator: BundledFunction;
  };
  api: InternalApiRoutes;
  /**
   * Activities declared within the Service.
   */
  activities: {
    [activityId: string]: ActivityFunction;
  };
  /**
   * The events and their schema.
   */
  events: {
    [eventName: string]: EventSpec;
  };
  /**
   * All subscriptions to events declared within the service.
   */
  subscriptions: {
    /**
     * Individually bundled {@link SubscriptionFunction}s containing a single `subscription` handler.
     */
    [subscriptionName: string]: SubscriptionFunction;
  };
  commands: {
    default: CommandFunction;
    /**
     * Individually bundled and tree-shaken functions for a specific Command.
     */
    [commandName: string]: CommandFunction;
  };
  internal: {
    activities: {
      fallbackHandler: BundledFunction<undefined>;
    };
    scheduler: {
      forwarder: BundledFunction;
      timerHandler: BundledFunction;
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
  file: string;
  /**
   * Export name of the handler in the file.
   *
   * @default index.default
   */
  handler?: string;
} & (Spec extends undefined
  ? {
      spec?: Spec;
    }
  : {
      spec: Spec;
    });

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
