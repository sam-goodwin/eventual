import type {
  BucketNotificationHandlerSpec,
  BucketSpec,
  CommandSpec,
  EntitySpec,
  EntityStreamSpec,
  EventSpec,
  EventualService,
  IndexSpec,
  QueueHandlerSpec,
  QueueSpec,
  SubscriptionSpec,
  TaskSpec,
  TransactionSpec,
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
  queues: Queues;
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
    searchService: {
      customResourceHandler: BundledFunction;
    };
  };
}

export interface EntityRuntime extends Omit<EntitySpec, "streams"> {
  streams: EntityStreamFunction[];
}

export interface BucketRuntime extends Omit<BucketSpec, "handlers"> {
  handlers: BucketNotificationHandlerFunction[];
}

export interface QueueRuntime extends Omit<QueueSpec, "handler"> {
  handler: QueueHandlerFunction;
}

export interface Entities {
  entities: EntityRuntime[];
  transactions: TransactionSpec[];
}

export interface Buckets {
  buckets: BucketRuntime[];
}

export interface Queues {
  queues: QueueRuntime[];
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

export type QueueHandlerFunction = BundledFunction<QueueHandlerSpec>;
