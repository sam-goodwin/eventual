import type { ActivitySpec } from "@eventual/core";
import type {
  CommandSpec,
  EventSpec,
  SubscriptionSpec,
} from "@eventual/core/internal";

export interface BuildManifest {
  workflows: {
    orchestrator: BundledFunction;
  };
  api: InternalApiRoutes;
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
