import { EventualServiceClient } from "@eventual/core";
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
  serviceClient: EventualServiceClient | undefined;
  serviceUrls?: (string | LazyValue<string>)[];
  serviceSpec?: ServiceSpec;
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
      serviceUrls: (deps.serviceUrls ?? []).map(getLazy),
    });
  }
}
