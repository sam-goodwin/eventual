import type {
  EventualServiceClient,
  OpenSearchClient,
  ServiceContext,
} from "@eventual/core";
import {
  registerBucketHook,
  registerEntityHook,
  registerEnvironmentManifest,
  registerOpenSearchHook,
  registerServiceClient,
  ServiceSpec,
} from "@eventual/core/internal";
import type { BucketStore } from "../stores/bucket-store.js";
import type { EntityStore } from "../stores/entity-store.js";
import { getLazy, LazyValue } from "../utils.js";

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

export function registerWorkerIntrinsics(deps: WorkerIntrinsicDeps) {
  if (deps.entityStore) {
    registerEntityHook(deps.entityStore);
  }
  if (deps.bucketStore) {
    registerBucketHook(deps.bucketStore);
  }
  if (deps.serviceClient) {
    registerServiceClient(deps.serviceClient);
  }
  if (deps.openSearchClient) {
    registerOpenSearchHook({
      client: deps.openSearchClient,
    });
  }
  if (deps.serviceSpec) {
    registerEnvironmentManifest({
      serviceSpec: deps.serviceSpec,
      serviceUrl: getLazy(deps.serviceUrl),
      serviceName: getLazy(deps.serviceName),
    });
  }
}

export function getServiceContext(deps: WorkerIntrinsicDeps): ServiceContext {
  return {
    serviceName: getLazy(deps.serviceName),
    serviceUrl: getLazy(deps.serviceUrl),
  };
}
