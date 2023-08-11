import type { EntityStreamContext, EntityStreamItem } from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import { normalizeCompositeKey } from "../stores/entity-store.js";
import { getLazy, promiseAllSettledPartitioned } from "../utils.js";
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
        const itemsByKey: Record<string, EntityStreamItem<any>[]> = {};
        items.forEach((item) => {
          const normalizedKey = normalizeCompositeKey(entity, item.key);
          const serializedKey = JSON.stringify(normalizedKey);
          (itemsByKey[serializedKey] ??= []).push(item);
        });

        const results = await promiseAllSettledPartitioned(
          Object.entries(itemsByKey),
          async ([, itemGroup]) => {
            for (const i in itemGroup) {
              const item = itemGroup[i]!;
              try {
                const result = await streamHandler.handler(item, context);
                // if the handler doesn't fail and doesn't return false, continue
                if (result !== false) {
                  continue;
                }
              } catch {}
              // if the handler fails or returns false, return the rest of the items
              return itemGroup.slice(Number(i)).map((i) => i.id);
            }
            return [];
          }
        );

        return {
          failedItemIds: results.fulfilled.flatMap((s) => s[1]),
        };
      }
    }
  );
}
