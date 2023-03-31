// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { DictionaryStreamItem } from "@eventual/core";
import {
  createDictionaryStreamWorker,
  getLazy,
  promiseAllSettledPartitioned,
} from "@eventual/core-runtime";
import { DictionaryStreamOperation } from "@eventual/core/internal";
import { DynamoDBStreamHandler } from "aws-lambda";
import { createDictionaryClient, createServiceClient } from "../create.js";
import { dictionaryName, dictionaryStreamName } from "../env.js";
import { DictionaryEntityRecord } from "../stores/dictionary-store.js";

const worker = createDictionaryStreamWorker({
  eventualClient: createServiceClient({}),
  dictionaryClient: createDictionaryClient(),
});

export default (async (event) => {
  const records = event.Records;
  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      try {
        const keys = record.dynamodb?.Keys as Partial<DictionaryEntityRecord>;
        const pk = keys?.pk?.S;
        const sk = keys?.sk?.S;
        const operation = record.eventName?.toLowerCase() as
          | DictionaryStreamOperation
          | undefined;
        const oldItem = record.dynamodb?.OldImage as
          | Partial<DictionaryEntityRecord>
          | undefined;
        const newItem = record.dynamodb?.NewImage as
          | Partial<DictionaryEntityRecord>
          | undefined;

        if (pk && sk && operation) {
          const namespace =
            DictionaryEntityRecord.parseNamespaceFromPartitionKey(pk);
          const key = DictionaryEntityRecord.parseKeyFromSortKey(sk);

          const item: DictionaryStreamItem<any> = {
            dictionaryName: getLazy(dictionaryName),
            streamName: getLazy(dictionaryStreamName),
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
