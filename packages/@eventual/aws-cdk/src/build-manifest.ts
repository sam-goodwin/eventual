import type { CommandSpec, EventSpec, SubscriptionSpec } from "@eventual/core";

export interface BuildManifest {
  orchestrator: BundledFunction;
  api: InternalApiRoutes;
  scheduler: {
    forwarder: BundledFunction;
    timerHandler: BundledFunction;
  };
  /**
   * Activities declared within the Service.
   */
  // TODO: split out into individual activity functions
  activities: {
    handler: BundledFunction<undefined>;
    fallbackHandler: BundledFunction<undefined>;
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
     * Individually bundled {@link SubscriptionFunction}s containing a single `onEvent` event handler.
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

export interface InternalCommandFunction extends CommandFunction {
  spec: CommandFunction["spec"] & {};
}

export interface CommandFunction extends BundledFunction<CommandSpec> {}
