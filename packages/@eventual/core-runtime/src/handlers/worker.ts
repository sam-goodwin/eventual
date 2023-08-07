import { EventualServiceClient } from "@eventual/core";
import { ServiceSpec, ServiceType } from "@eventual/core/internal";
import { OpenSearchClient } from "../clients/open-search-client.js";
import { DefaultEventualHook } from "../default-eventual-hook.js";
import {
  UnsupportedExecutor,
  UnsupportedPropertyRetriever,
  enterEventualCallHookScope,
} from "../eventual-hook.js";
import { AwaitTimerCallPassthroughExecutor } from "../call-executors/await-timer-executor.js";
import { ServiceClientExecutor } from "../call-executors/service-client-executor.js";
import { serviceTypeScope } from "../service-type.js";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import type { LazyValue } from "../utils.js";
import { SearchCallExecutor } from "../call-executors/search-call-client-executor.js";
import { OpenSearchClientPropertyRetriever } from "../property-retrievers/open-search-client-property-retriever.js";
import { BucketCallExecutor } from "../call-executors/bucket-call-executor.js";
import { BucketPhysicalNamePropertyRetriever } from "../property-retrievers/bucket-name-property-retriever.js";
import { EntityCallExecutor } from "../call-executors/entity-call-executor.js";

export interface WorkerIntrinsicDeps {
  bucketStore: BucketStore | undefined;
  entityStore: EntityStore | undefined;
  openSearchClient: OpenSearchClient | undefined;
  serviceClient: EventualServiceClient | undefined;
  serviceName: string | LazyValue<string>;
  serviceSpec: ServiceSpec | undefined;
  serviceUrl: string | LazyValue<string>;
  serviceUrls?: (string | LazyValue<string>)[];
}

export function createEventualWorker<Input extends any[], Output>(
  serviceType: ServiceType,
  dep: WorkerIntrinsicDeps,
  worker: (...input: Input) => Promise<Output>
): (...input: Input) => Promise<Awaited<Output>> {
  const unsupportedExecutor = new UnsupportedExecutor("Eventual Worker");
  const unsupportedProperty = new UnsupportedPropertyRetriever(
    "Eventual Worker"
  );
  const serviceClientExecutor = dep.serviceClient
    ? new ServiceClientExecutor(dep.serviceClient)
    : unsupportedExecutor;
  const openSearchExecutor = dep.openSearchClient
    ? new SearchCallExecutor(dep.openSearchClient)
    : unsupportedExecutor;
  const openSearchClientPropertyRetriever = dep.openSearchClient
    ? new OpenSearchClientPropertyRetriever(dep.openSearchClient)
    : unsupportedProperty;
  const bucketCallExecutor = dep.bucketStore
    ? new BucketCallExecutor(dep.bucketStore)
    : unsupportedExecutor;
  const bucketPhysicalNameRetriever = dep.bucketStore
    ? new BucketPhysicalNamePropertyRetriever(dep.bucketStore)
    : unsupportedProperty;
  const entityCallExecutor = dep.entityStore
    ? new EntityCallExecutor(dep.entityStore)
    : unsupportedExecutor;

  return (...input: Input) =>
    enterEventualCallHookScope(
      new DefaultEventualHook(
        {
          AwaitTimerCall: new AwaitTimerCallPassthroughExecutor(),
          BucketCall: bucketCallExecutor,
          ChildWorkflowCall: unsupportedExecutor,
          // conditions do not work outside of a workflow
          ConditionCall: unsupportedExecutor,
          EmitEventsCall: serviceClientExecutor,
          EntityCall: entityCallExecutor,
          // expect signal does not work outside of a workflow
          ExpectSignalCall: unsupportedExecutor,
          GetExecutionCall: serviceClientExecutor,
          InvokeTransactionCall: serviceClientExecutor,
          // register signal handler does not work outside of a workflow
          RegisterSignalHandlerCall: unsupportedExecutor,
          SearchCall: openSearchExecutor,
          SendSignalCall: serviceClientExecutor,
          StartWorkflowCall: serviceClientExecutor,
          // directly calling a task does not work outside of a workflow
          TaskCall: unsupportedExecutor,
          TaskRequestCall: serviceClientExecutor,
        },
        {
          BucketPhysicalName: bucketPhysicalNameRetriever,
          OpenSearchClient: openSearchClientPropertyRetriever,
          ServiceClient: dep.serviceClient ?? unsupportedProperty,
          ServiceName: dep.serviceName,
          ServiceSpec: dep.serviceSpec ?? unsupportedProperty,
          ServiceUrl: dep.serviceUrl,
        }
      ),
      () => serviceTypeScope(serviceType, () => worker(...input))
    );
}
