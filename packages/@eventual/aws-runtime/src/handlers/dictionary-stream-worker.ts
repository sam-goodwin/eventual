// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { DictionaryStreamItem } from "@eventual/core";
import {
  createDictionaryStreamWorker,
  promiseAllSettledPartitioned,
} from "@eventual/core-runtime";
import { DictionaryStreamOperation } from "@eventual/core/internal";
import { DynamoDBBatchResponse, DynamoDBRecord } from "aws-lambda";
import { createDictionaryClient, createServiceClient } from "../create.js";
import { DictionaryEntityRecord } from "../stores/dictionary-store.js";

export interface AWSDictionaryStreamItem {
  streamName: string;
  pk: string;
  sk: string;
  newValue?: string;
  oldValue?: string;
  newVersion?: number;
  oldVersion?: number;
  operation: DynamoDBRecord["eventName"];
  eventID: string;
}

const worker = createDictionaryStreamWorker({
  eventualClient: createServiceClient({}),
  dictionaryClient: createDictionaryClient(),
});

export default async (
  records: AWSDictionaryStreamItem[]
): Promise<DynamoDBBatchResponse> => {
  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      try {
        const { name, namespace } =
          DictionaryEntityRecord.parseNameAndNamespaceFromPartitionKey(
            record.pk
          );
        const key = DictionaryEntityRecord.parseKeyFromSortKey(record.sk);

        if (record.operation) {
          const item: DictionaryStreamItem<any> = {
            dictionaryName: name,
            namespace,
            key,
            newValue: record.newValue ? JSON.parse(record.newValue) : undefined,
            newVersion: record.newVersion
              ? Number(record.newVersion)
              : (undefined as any),
            operation:
              record.operation.toLowerCase() as DictionaryStreamOperation,
            streamName: record.streamName,
            oldValue: record.oldValue ? JSON.parse(record.oldValue) : undefined,
            oldVersion: record.oldVersion
              ? Number(record.oldVersion)
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
      ...results.rejected.map((r) => ({ itemIdentifier: r[0].eventID })),
      // if a record returns false, consider it a failure
      ...results.fulfilled
        .filter((f) => f[1] === false)
        .map((f) => ({ itemIdentifier: f[0].eventID })),
    ],
  };
};
