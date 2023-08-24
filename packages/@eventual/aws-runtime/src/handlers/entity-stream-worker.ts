import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { EntityStreamItem } from "@eventual/core";
import {
  GlobalEntityProvider,
  convertNormalizedEntityKeyToMap,
  createEntityStreamWorker,
  getLazy,
  normalizeCompositeKey,
} from "@eventual/core-runtime";
import type { EntityStreamOperation } from "@eventual/core/internal";
import type { DynamoDBStreamHandler } from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createOpenSearchClient,
  createQueueClient,
  createServiceClient,
} from "../create.js";
import {
  entityName,
  entityStreamName,
  serviceName,
  serviceUrl,
} from "../env.js";
import { EntityEntityRecord } from "../stores/entity-store.js";

const entityProvider = new GlobalEntityProvider();

const worker = createEntityStreamWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  openSearchClient: await createOpenSearchClient(serviceSpec),
  queueClient: createQueueClient(),
  serviceClient: createServiceClient({}),
  serviceSpec,
  serviceName,
  serviceUrl,
});

export default (async (event) => {
  const records = event.Records;
  console.log("records", JSON.stringify(records, undefined, 4));

  const items = records.flatMap((record) => {
    const operation = record.eventName?.toLowerCase() as
      | EntityStreamOperation
      | undefined;
    const oldItem = record.dynamodb?.OldImage as
      | Partial<EntityEntityRecord>
      | undefined;
    const newItem = record.dynamodb?.NewImage as
      | Partial<EntityEntityRecord>
      | undefined;

    const _entityName = getLazy(entityName);
    const entity = entityProvider.getEntity(_entityName);

    if (!entity) {
      throw new Error(`Entity ${_entityName} was not found`);
    }

    const newValue = newItem
      ? unmarshall(newItem as Record<string, AttributeValue>)
      : undefined;
    const newVersion = newValue?.__version;

    const oldValue = oldItem
      ? unmarshall(oldItem as Record<string, AttributeValue>)
      : undefined;
    const oldVersion = oldValue?.__version;

    const bestValue = newValue ?? oldValue;
    if (!bestValue) {
      throw new Error(
        "Expected at least one of old value or new value in the stream event."
      );
    }

    const normalizedKey = normalizeCompositeKey(entity, bestValue);
    const keyMap = convertNormalizedEntityKeyToMap(normalizedKey);

    if (newValue) {
      delete newValue[EntityEntityRecord.VERSION_FIELD];
      delete newValue[normalizedKey.partition.keyAttribute];
      if (normalizedKey.sort) {
        delete newValue[normalizedKey.sort.keyAttribute];
      }
    }
    if (oldValue) {
      delete oldValue[EntityEntityRecord.VERSION_FIELD];
      delete oldValue[normalizedKey.partition.keyAttribute];
      if (normalizedKey.sort) {
        delete oldValue[normalizedKey.sort.keyAttribute];
      }
    }

    if (operation) {
      const item: EntityStreamItem = {
        id: record.eventID!,
        key: keyMap,
        newValue: newValue as any,
        newVersion,
        operation,
        oldValue,
        oldVersion,
      };

      return item;
    } else {
      return [];
    }
  });

  const results = await worker(
    getLazy(entityName),
    getLazy(entityStreamName),
    items
  );

  return {
    batchItemFailures: results.failedItemIds.map((i) => ({
      itemIdentifier: i,
    })),
  };
}) satisfies DynamoDBStreamHandler;
