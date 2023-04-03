import { EntityStreamItem, EventualServiceClient } from "@eventual/core";
import {
  ServiceType,
  entities,
  registerEntityHook,
  registerServiceClient,
  serviceTypeScope,
} from "@eventual/core/internal";
import { EntityClient } from "../clients/entity-client.js";

export interface EntityStreamWorker {
  (item: EntityStreamItem<any>): false | void | Promise<false | void>;
}

interface EntityStreamWorkerDependencies {
  eventualClient?: EventualServiceClient;
  entityClient?: EntityClient;
}

export function createEntityStreamWorker(
  dependencies: EntityStreamWorkerDependencies
): EntityStreamWorker {
  if (dependencies.eventualClient) {
    registerServiceClient(dependencies.eventualClient);
  }
  if (dependencies.entityClient) {
    registerEntityHook(dependencies.entityClient);
  }

  return async (item) =>
    serviceTypeScope(ServiceType.EntityStreamWorker, async () => {
      const streamHandler = entities()
        .get(item.entityName)
        ?.streams.find((s) => s.name === item.streamName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.streamName} does not exist`);
      }
      return await streamHandler.handler(item);
    });
}
