import type { ActivitySpec } from "@eventual/core";
import type {
  CommandSpec,
  EventSpec,
  EventualService,
  SubscriptionSpec,
} from "@eventual/core/internal";

export interface BuildManifest {
  serviceName: string;
  entry: string;
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
  commandDefault: CommandFunction;
  system: {
    activityService: {
      fallbackHandler: BundledFunction<undefined>;
    };
    eventualService: {
      systemCommandHandler: BundledFunction;
      commands: CommandSpec[];
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

export type InternalCommandName = keyof EventualService;

export type InternalCommands = Record<
  InternalCommandName,
  InternalCommandFunction
>;

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

export interface InternalCommandFunction extends CommandFunction {}

export interface CommandFunction extends BundledFunction<CommandSpec> {}
