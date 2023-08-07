import { EventualServiceClient } from "@eventual/core";
import { ServiceSpec, ServiceType } from "@eventual/core/internal";
import { OpenSearchClient } from "../clients/open-search-client.js";
import { DefaultEventualHook } from "../default-eventual-hook.js";
import {
  UnsupportedExecutor,
  UnsupportedPropertyRetriever,
  enterEventualCallHookScope,
} from "../eventual-hook.js";
import { AwaitTimerCallPassthroughExecutor } from "../executors/await-timer-executor.js";
import { ServiceClientExecutor } from "../executors/service-client-executor.js";
import { serviceTypeScope } from "../service-type.js";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import type { LazyValue } from "../utils.js";

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
          AwaitTimerCall: new AwaitTimerCallPassthroughExecutor(),
          BucketCall: dep.bucketStore ?? unsupportedExecutor,
          ChildWorkflowCall: unsupportedExecutor,
          // conditions do not work outside of a workflow
          ConditionCall: unsupportedExecutor,
          EmitEventsCall: serviceClientExecutor,
          EntityCall: dep.entityStore ?? unsupportedExecutor,
          // expect signal does not work outside of a workflow
          ExpectSignalCall: unsupportedExecutor,
          GetExecutionCall: serviceClientExecutor,
          InvokeTransactionCall: serviceClientExecutor,
          // register signal handler does not work outside of a workflow
          RegisterSignalHandlerCall: unsupportedExecutor,
          SearchCall: dep.openSearchClient ?? unsupportedExecutor,
          SendSignalCall: serviceClientExecutor,
          StartWorkflowCall: serviceClientExecutor,
          TaskCall: unsupportedExecutor,
          TaskRequestCall: serviceClientExecutor,
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
