import type { EventualServiceClient } from "@eventual/core";
import { ServiceType, type ServiceSpec } from "@eventual/core/internal";
import {
  AllCallExecutor,
  AllCallExecutors,
  UnsupportedExecutor,
} from "../call-executor.js";
import { AwaitTimerCallPassthroughExecutor } from "../call-executors/await-timer-executor.js";
import { BucketCallExecutor } from "../call-executors/bucket-call-executor.js";
import { EntityCallExecutor } from "../call-executors/entity-call-executor.js";
import { QueueCallExecutor } from "../call-executors/queue-call-executor.js";
import { SearchCallExecutor } from "../call-executors/search-call-executor.js";
import { ServiceClientExecutor } from "../call-executors/service-client-executor.js";
import type { OpenSearchClient } from "../clients/open-search-client.js";
import type { QueueClient } from "../clients/queue-client.js";
import { enterEventualCallHookScope } from "../eventual-hook.js";
import {
  AllPropertyRetriever,
  AllPropertyRetrievers,
  UnsupportedPropertyRetriever,
} from "../property-retriever.js";
import { BucketPhysicalNamePropertyRetriever } from "../property-retrievers/bucket-name-property-retriever.js";
import { OpenSearchClientPropertyRetriever } from "../property-retrievers/open-search-client-property-retriever.js";
import { QueuePhysicalNamePropertyRetriever } from "../property-retrievers/queue-name-property-retriever.js";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import type { LazyValue } from "../utils.js";

export interface WorkerIntrinsicDeps {
  bucketStore: BucketStore | undefined;
  entityStore: EntityStore | undefined;
  openSearchClient: OpenSearchClient | undefined;
  queueClient: QueueClient | undefined;
  serviceClient: EventualServiceClient | undefined;
  serviceName: string | LazyValue<string>;
  serviceSpec: ServiceSpec | undefined;
  serviceUrl: string | LazyValue<string>;
}

type AllExecutorOverrides<Input extends any[]> = {
  [key in keyof AllCallExecutors]?:
    | AllCallExecutors[key]
    | ((...input: Input) => AllCallExecutors[key]);
};

type AllPropertyOverridesOverrides<Input extends any[]> = {
  [key in keyof AllPropertyRetrievers]?:
    | AllPropertyRetrievers[key]
    // a function would be ambiguous with the property retriever
    | { override: (...input: Input) => AllPropertyRetrievers[key] };
};

export function createEventualWorker<Input extends any[], Output>(
  props: WorkerIntrinsicDeps & {
    serviceType: ServiceType;
    executorOverrides?: AllExecutorOverrides<Input>;
    propertyRetrieverOverrides?: AllPropertyOverridesOverrides<Input>;
  },
  worker: (...input: Input) => Promise<Output>
): (...input: Input) => Promise<Awaited<Output>> {
  const unsupportedExecutor = new UnsupportedExecutor("Eventual Worker");
  const unsupportedProperty = new UnsupportedPropertyRetriever(
    "Eventual Worker"
  );
  const serviceClientExecutor = props.serviceClient
    ? new ServiceClientExecutor(props.serviceClient)
    : unsupportedExecutor;
  const openSearchExecutor = props.openSearchClient
    ? new SearchCallExecutor(props.openSearchClient)
    : unsupportedExecutor;
  const openSearchClientPropertyRetriever = props.openSearchClient
    ? new OpenSearchClientPropertyRetriever(props.openSearchClient)
    : unsupportedProperty;
  const bucketCallExecutor = props.bucketStore
    ? new BucketCallExecutor(props.bucketStore)
    : unsupportedExecutor;
  const bucketPhysicalNameRetriever = props.bucketStore
    ? new BucketPhysicalNamePropertyRetriever(props.bucketStore)
    : unsupportedProperty;
  const entityCallExecutor = props.entityStore
    ? new EntityCallExecutor(props.entityStore)
    : unsupportedExecutor;
  const queueCallExecutor = props.queueClient
    ? new QueueCallExecutor(props.queueClient)
    : unsupportedExecutor;
  const queuePhysicalNamePropertyRetriever = props.queueClient
    ? new QueuePhysicalNamePropertyRetriever(props.queueClient)
    : unsupportedProperty;

  return (...input: Input) => {
    const resolvedExecutorOverrides = props.executorOverrides
      ? Object.fromEntries(
          Object.entries(props.executorOverrides).map(
            ([callKey, executorOverride]) => [
              callKey,
              typeof executorOverride === "function"
                ? executorOverride(...input)
                : executorOverride,
            ]
          )
        )
      : {};

    const resolvedPropertyOverrides = props.propertyRetrieverOverrides
      ? Object.fromEntries(
          Object.entries(props.propertyRetrieverOverrides).map(
            ([callKey, propertyOverride]) => [
              callKey,
              typeof propertyOverride === "object" &&
              "override" in propertyOverride
                ? propertyOverride.override(...input)
                : propertyOverride,
            ]
          )
        )
      : {};

    return enterEventualCallHookScope(
      new AllCallExecutor({
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
        QueueCall: queueCallExecutor,
        // register signal handler does not work outside of a workflow
        SignalHandlerCall: unsupportedExecutor,
        SearchCall: openSearchExecutor,
        SendSignalCall: serviceClientExecutor,
        StartWorkflowCall: serviceClientExecutor,
        // directly calling a task does not work outside of a workflow
        TaskCall: unsupportedExecutor,
        TaskRequestCall: serviceClientExecutor,
        ...resolvedExecutorOverrides,
      }),
      new AllPropertyRetriever({
        BucketPhysicalName: bucketPhysicalNameRetriever,
        OpenSearchClient: openSearchClientPropertyRetriever,
        QueuePhysicalName: queuePhysicalNamePropertyRetriever,
        ServiceClient: props.serviceClient ?? unsupportedProperty,
        ServiceName: props.serviceName,
        ServiceSpec: props.serviceSpec ?? unsupportedProperty,
        ServiceType: props.serviceType,
        ServiceUrl: props.serviceUrl,
        TaskToken: unsupportedProperty, // the task worker should override this
        ...resolvedPropertyOverrides,
      }),
      () => worker(...input)
    );
  };
}
