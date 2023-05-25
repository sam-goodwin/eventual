import type {
  BucketSpec,
  BucketNotificationHandlerSpec,
  CommandSpec,
  EntitySpec,
  EntityStreamSpec,
  EventSpec,
  EventualService,
  SubscriptionSpec,
  TaskSpec,
  TransactionSpec,
  IndexSpec,
} from "@eventual/core/internal";

export interface BuildManifest {
  serviceName: string;
  entry: string;
  /**
   * Tasks declared within the Service.
   */
  tasks: TaskFunction[];
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
  entities: Entities;
  buckets: Buckets;
  search: Search;
  system: {
    entityService: {
      transactionWorker: BundledFunction<undefined>;
    };
    taskService: {
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

export interface EntityRuntime extends Omit<EntitySpec, "streams"> {
  streams: EntityStreamFunction[];
}

export interface BucketRuntime extends Omit<BucketSpec, "handlers"> {
  handlers: BucketNotificationHandlerFunction[];
}

export interface Entities {
  entities: EntityRuntime[];
  transactions: TransactionSpec[];
}

export interface Buckets {
  buckets: BucketRuntime[];
}

export interface Search {
  indices: IndexSpec[];
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

export type SubscriptionFunction = BundledFunction<SubscriptionSpec>;

export type TaskFunction = BundledFunction<TaskSpec>;

export type InternalCommandFunction = CommandFunction;

export type CommandFunction = BundledFunction<CommandSpec>;

export type EntityStreamFunction = BundledFunction<EntityStreamSpec>;

export type BucketNotificationHandlerFunction =
  BundledFunction<BucketNotificationHandlerSpec>;
