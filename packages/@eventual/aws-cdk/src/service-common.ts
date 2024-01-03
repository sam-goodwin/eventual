import type { Function } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import type { BucketService } from "./bucket-service.js";
import type { BuildOutput } from "./build.js";
import type { CommandService } from "./command-service.js";
import type { EntityService } from "./entity-service.js";
import type { LazyInterface } from "./proxy-construct.js";
import type { QueueService } from "./queue-service.js";
import type { SearchService } from "./search/search-service.js";
import type { Service } from "./service.js";
import type { SocketService } from "./socket-service.js";
import type { Compliance } from "./compliance.js";

export interface ServiceConstructProps {
  /**
   * The built service describing the event subscriptions within the Service.
   */
  readonly build: BuildOutput;
  /**
   * Optional environment variables to add to the {@link EventService.defaultHandler}.
   *
   * @default - no extra environment variables
   */
  readonly environment?: Record<string, string>;
  readonly service: LazyInterface<Service<any>>;
  readonly serviceName: string;
  readonly serviceScope: Construct;
  readonly systemScope: Construct;
  readonly eventualServiceScope: Construct;
  readonly compliancePolicy: Compliance;
}

/**
 * A set of common dependencies that all worker handlers should have.
 *
 * Should match the calls that are supported by the {@link createEventualWorker} function.
 */
export interface WorkerServiceConstructProps extends ServiceConstructProps {
  queueService: LazyInterface<QueueService<Service>>;
  commandService: LazyInterface<CommandService<Service>>;
  bucketService: LazyInterface<BucketService<Service>>;
  entityService: LazyInterface<EntityService<Service>>;
  searchService: LazyInterface<SearchService<Service>> | undefined;
  socketService: LazyInterface<SocketService<Service>>;
}

export function configureWorkerCalls(
  serviceProps: WorkerServiceConstructProps,
  func: Function
) {
  serviceProps.commandService.configureInvokeHttpServiceApi(func);
  serviceProps.searchService?.configureSearch(func);
  serviceProps.queueService.configureSendMessage(func);
  serviceProps.bucketService.configureReadWriteBuckets(func);
  serviceProps.entityService.configureReadWriteEntityTable(func);
  serviceProps.entityService.configureInvokeTransactions(func);
  serviceProps.socketService.configureInvokeSocketEndpoints(func);
}
