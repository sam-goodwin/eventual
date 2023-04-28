import type { EventualServiceClient, ServiceContext } from "@eventual/core";
import {
  registerEntityHook,
  registerEnvironmentManifest,
  registerServiceClient,
  ServiceSpec,
} from "@eventual/core/internal";
import { EntityClient } from "../clients/entity-client.js";
import { getLazy, LazyValue } from "../utils.js";

export interface WorkerIntrinsicDeps {
  entityClient?: EntityClient;
  serviceClient?: EventualServiceClient;
  serviceName: string | LazyValue<string>;
  serviceSpec?: ServiceSpec;
  serviceUrl: string | LazyValue<string>;
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
