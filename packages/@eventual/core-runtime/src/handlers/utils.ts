import { EventualServiceClient } from "@eventual/core";
import {
  ServiceSpec,
  registerEntityHook,
  registerEnvironmentManifest,
  registerServiceClient,
} from "@eventual/core/internal";
import { EntityClient } from "../clients/entity-client.js";
import { LazyValue, getLazy } from "../utils.js";

export interface WorkerIntrinsicDeps {
  entityClient?: EntityClient;
  serviceClient?: EventualServiceClient;
  serviceUrls?: (string | LazyValue<string>)[];
  serviceSpec?: ServiceSpec;
}

export function registerWorkerIntrinsics(deps: WorkerIntrinsicDeps) {
  if (deps.entityClient) {
    registerEntityHook(deps.entityClient);
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
