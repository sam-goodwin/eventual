import type { EntityStreamContext, EntityStreamItem } from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import { normalizeCompositeKey } from "../stores/entity-store.js";
import { getLazy, groupedPromiseAllSettled } from "../utils.js";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export interface EntityStreamWorker {
  (
    entityName: string,
    streamName: string,
    items: EntityStreamItem<any>[]
  ): Promise<{
    failedItemIds: string[];
  }>;
}

type EntityStreamWorkerDependencies = WorkerIntrinsicDeps;

export function createEntityStreamWorker(
  dependencies: EntityStreamWorkerDependencies
): EntityStreamWorker {
  return createEventualWorker(
    { serviceType: ServiceType.EntityStreamWorker, ...dependencies },
    async (entityName, streamName, items) => {
      const entity = getEventualResource("Entity", entityName);
      const streamHandler = entity?.streams.find((s) => s.name === streamName);

      if (!entity || !streamHandler) {
        throw new Error(`Stream handler ${streamName} does not exist`);
      }

      const context: EntityStreamContext = {
        stream: { entityName, streamName },
        service: {
          serviceName: getLazy(dependencies.serviceName),
          serviceUrl: getLazy(dependencies.serviceUrl),
        },
      };

      if (streamHandler.kind === "EntityBatchStream") {
        const result = await streamHandler.handler(items, context);

        return { failedItemIds: result?.failedItemIds ?? [] };
      } else {
        const groupResults = await groupedPromiseAllSettled(
          items,
          (item) => {
            const normalizedKey = normalizeCompositeKey(entity, item.key);
            return JSON.stringify(normalizedKey);
          },
          async (item) => {
            const result = streamHandler.handler(item, context);
            if (result === false) {
              throw new Error("Handler failed");
            }
            return result;
          }
        );

        return {
          failedItemIds: Object.values(groupResults).flatMap((g) =>
            g.rejected.map(([item]) => item.id)
          ),
        };
      }
    }
  );
}
