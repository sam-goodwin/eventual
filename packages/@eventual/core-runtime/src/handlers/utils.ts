import type { EventualServiceClient, ServiceContext } from "@eventual/core";
import {
  registerBucketHook,
  registerEntityHook,
  registerEnvironmentManifest,
  registerServiceClient,
  ServiceSpec,
} from "@eventual/core/internal";
import { EntityClient } from "../clients/entity-client.js";
import { BucketStore } from "../index.js";
import { getLazy, LazyValue } from "../utils.js";

export interface WorkerIntrinsicDeps {
  bucketStore: BucketStore | undefined;
  entityClient: EntityClient | undefined;
  serviceName: string | LazyValue<string>;
  serviceClient: EventualServiceClient | undefined;
  serviceUrls?: (string | LazyValue<string>)[];
  serviceSpec: ServiceSpec | undefined;
  serviceUrl: string | LazyValue<string>;
}

export function registerWorkerIntrinsics(deps: WorkerIntrinsicDeps) {
  if (deps.entityClient) {
    registerEntityHook(deps.entityClient);
  }
  if (deps.bucketStore) {
    registerBucketHook(deps.bucketStore);
  }
  if (deps.serviceClient) {
    registerServiceClient(deps.serviceClient);
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
