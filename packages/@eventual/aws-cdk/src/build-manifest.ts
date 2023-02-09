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
  activities: BundledFunction<undefined>;
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

export interface InternalApiFunction
  extends Omit<CommandFunction, "exportName"> {}

export interface CommandFunction extends BundledFunction<CommandSpec> {}
