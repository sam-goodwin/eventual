import { EntityStreamItem } from "@eventual/core";
import {
  ServiceType,
  entities,
  serviceTypeScope,
} from "@eventual/core/internal";
import { getLazy } from "../utils.js";
import { WorkerIntrinsicDeps, registerWorkerIntrinsics } from "./utils.js";

export interface EntityStreamWorker {
  (item: EntityStreamItem<any>): false | void | Promise<false | void>;
}

type EntityStreamWorkerDependencies = WorkerIntrinsicDeps;

export function createEntityStreamWorker(
  dependencies: EntityStreamWorkerDependencies
): EntityStreamWorker {
  registerWorkerIntrinsics(dependencies);

  return async (item) =>
    serviceTypeScope(ServiceType.EntityStreamWorker, async () => {
      const streamHandler = entities()
        .get(item.entityName)
        ?.streams.find((s) => s.name === item.streamName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.streamName} does not exist`);
      }
      return await streamHandler.handler(item, {
        service: {
          serviceName: getLazy(dependencies.serviceName),
          serviceUrl: getLazy(dependencies.serviceUrl),
        },
      });
    });
}
