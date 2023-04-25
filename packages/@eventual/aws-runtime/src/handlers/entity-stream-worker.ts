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
  createEntityClient,
  createServiceClient,
} from "../create.js";
import { entityName, entityStreamName, serviceUrl } from "../env.js";
import { EntityEntityRecord } from "../stores/entity-store.js";

const worker = createEntityStreamWorker({
  bucketStore: createBucketStore(),
  entityClient: createEntityClient(),
  serviceClient: createServiceClient({}),
  serviceSpec,
  serviceUrls: [serviceUrl],
});

export default (async (event) => {
  const records = event.Records;
  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      try {
        const keys = record.dynamodb?.Keys as Partial<EntityEntityRecord>;
        const pk = keys?.pk?.S;
        const sk = keys?.sk?.S;
        const operation = record.eventName?.toLowerCase() as
          | EntityStreamOperation
          | undefined;
        const oldItem = record.dynamodb?.OldImage as
          | Partial<EntityEntityRecord>
          | undefined;
        const newItem = record.dynamodb?.NewImage as
          | Partial<EntityEntityRecord>
          | undefined;

        if (pk && sk && operation) {
          const namespace =
            EntityEntityRecord.parseNamespaceFromPartitionKey(pk);
          const key = EntityEntityRecord.parseKeyFromSortKey(sk);

          const item: EntityStreamItem<any> = {
            entityName: getLazy(entityName),
            streamName: getLazy(entityStreamName),
            namespace,
            key,
            newValue: newItem?.value?.S
              ? JSON.parse(newItem?.value?.S)
              : undefined,
            newVersion: newItem?.version?.N
              ? Number(newItem?.version?.N)
              : (undefined as any),
            operation,
            oldValue: oldItem?.value?.S
              ? JSON.parse(oldItem?.value?.S)
              : undefined,
            oldVersion: oldItem?.version?.N
              ? Number(oldItem?.version?.N)
              : undefined,
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
