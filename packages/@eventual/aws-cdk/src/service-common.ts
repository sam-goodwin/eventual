import { Function } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { BucketService } from "./bucket-service";
import { BuildOutput } from "./build";
import { CommandService } from "./command-service";
import { EntityService } from "./entity-service";
import { LazyInterface } from "./proxy-construct";
import { SearchService } from "./search/search-service";
import { Service } from "./service";

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
}

/**
 * A set of common dependencies that all worker handlers should have.
 *
 * Should match the calls that are supported by the {@link createEventualWorker} function.
 */
export interface WorkerServiceConstructProps extends ServiceConstructProps {
  commandService: LazyInterface<CommandService<Service>>;
  bucketService: LazyInterface<BucketService<Service>>;
  entityService: LazyInterface<EntityService<Service>>;
  searchService: LazyInterface<SearchService<Service>> | undefined;
}

export function configureWorkerCalls(
  serviceProps: WorkerServiceConstructProps,
  func: Function
) {
  serviceProps.commandService.configureInvokeHttpServiceApi(func);
  serviceProps.searchService?.configureSearch(func);
  serviceProps.bucketService.configureReadWriteBuckets(func);
  serviceProps.entityService.configureReadWriteEntityTable(func);
  serviceProps.entityService.configureInvokeTransactions(func);
}
