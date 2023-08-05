import { ServiceSpec, ServiceType } from "@eventual/core/internal";
import { DefaultEventualHook } from "../default-eventual-hook.js";
import {
  UnsupportedExecutor,
  UnsupportedPropertyRetriever,
  enterEventualCallHookScope,
} from "../eventual-hook.js";
import { ServiceClientExecutor } from "../executor/service-client-executor.js";
import { serviceTypeScope } from "../service-type.js";
import { EventualServiceClient } from "@eventual/core";
import { LazyValue } from "../utils.js";
import { EntityStore } from "../stores/entity-store.js";
import { BucketStore } from "../stores/bucket-store.js";
import { OpenSearchClient } from "../clients/open-search-client.js";

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

  return (...input: Input) =>
    enterEventualCallHookScope(
      new DefaultEventualHook(
        {
          AwaitTimerCall: unsupportedExecutor,
          ConditionCall: unsupportedExecutor,
          EmitEventsCall: unsupportedExecutor,
          ExpectSignalCall: unsupportedExecutor,
          RegisterSignalHandlerCall: unsupportedExecutor,
          WorkflowCall: unsupportedExecutor,
          TaskCall: unsupportedExecutor,
          TaskRequestCall: serviceClientExecutor,
          SendSignalCall: serviceClientExecutor,
          SearchCall: dep.openSearchClient ?? unsupportedExecutor,
          BucketCall: unsupportedExecutor,
          EntityCall: unsupportedExecutor,
          InvokeTransactionCall: unsupportedExecutor,
        },
        {
          BucketPhysicalName: dep.bucketStore ?? unsupportedProperty,
          OpenSearchClient: dep.openSearchClient ?? unsupportedProperty,
          ServiceClient: dep.serviceClient ?? unsupportedProperty,
          ServiceName: dep.serviceName,
          ServiceSpec: dep.serviceSpec ?? unsupportedProperty,
          ServiceUrl: dep.serviceUrl,
        }
      ),
      () => serviceTypeScope(serviceType, () => worker(...input))
    );
}
