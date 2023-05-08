import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { EntityStreamItem } from "@eventual/core";
import {
  createEntityStreamWorker,
  getLazy,
  promiseAllSettledPartitioned,
} from "@eventual/core-runtime";
import { EntityStreamOperation } from "@eventual/core/internal";
import { DynamoDBStreamHandler } from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createServiceClient,
} from "../create.js";
import {
  entityName,
  entityStreamName,
  serviceName,
  serviceUrl,
} from "../env.js";
import { EntityEntityRecord } from "../stores/entity-store.js";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { AttributeValue } from "@aws-sdk/client-dynamodb";

const worker = createEntityStreamWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  serviceClient: createServiceClient({}),
  serviceSpec,
  serviceName,
  serviceUrl,
});

export default (async (event) => {
  const records = event.Records;
  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      try {
        const keys = record.dynamodb?.Keys;
        const operation = record.eventName?.toLowerCase() as
          | EntityStreamOperation
          | undefined;
        const oldItem = record.dynamodb?.OldImage as
          | Partial<EntityEntityRecord>
          | undefined;
        const newItem = record.dynamodb?.NewImage as
          | Partial<EntityEntityRecord>
          | undefined;

        const { __version: newVersion = undefined, ...newValue } = newItem
          ? unmarshall(newItem as Record<string, AttributeValue>)
          : {};

        const { __version: oldVersion = undefined, ...oldValue } = oldItem
          ? unmarshall(oldItem as Record<string, AttributeValue>)
          : {};

        if (keys && operation) {
          const item: EntityStreamItem = {
            entityName: getLazy(entityName),
            streamName: getLazy(entityStreamName),
            key: unmarshall(keys as Record<string, AttributeValue>),
            newValue,
            newVersion,
            operation,
            oldValue,
            oldVersion,
          };

          return worker(item);
        } else {
          return true;
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    }
  );

  return {
    batchItemFailures: [
      // consider any errors to be failure
      ...results.rejected.map((r) => ({ itemIdentifier: r[0].eventID! })),
      // if a record returns false, consider it a failure
      ...results.fulfilled
        .filter((f) => f[1] === false)
        .map((f) => ({ itemIdentifier: f[0].eventID! })),
    ],
  };
}) satisfies DynamoDBStreamHandler;
