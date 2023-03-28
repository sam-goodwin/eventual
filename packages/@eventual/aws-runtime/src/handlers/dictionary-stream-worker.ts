// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { promiseAllSettledPartitioned } from "@eventual/core-runtime";
import {
  DictionaryStreamOperation,
  dictionaryStreams,
  registerDictionaryHook,
  registerServiceClient,
} from "@eventual/core/internal";
import { DynamoDBBatchResponse, DynamoDBRecord } from "aws-lambda";
import { createDictionaryClient, createServiceClient } from "../create.js";
import { DictionaryEntityRecord } from "../stores/dictionary-store.js";

const eventualClient = createServiceClient({});
const dictionaryClient = createDictionaryClient();

export interface AWSDictionaryStreamItem {
  streamName: string;
  pk: string;
  sk: string;
  newValue: string;
  oldValue?: string;
  newVersion: number;
  oldVersion?: number;
  operation: DynamoDBRecord["eventName"];
  eventID: string;
}

export default async (
  records: AWSDictionaryStreamItem[]
): Promise<DynamoDBBatchResponse> => {
  registerServiceClient(eventualClient);
  registerDictionaryHook(dictionaryClient);

  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      const { name, namespace } =
        DictionaryEntityRecord.parseNameAndNamespaceFromPartitionKey(record.pk);
      const key = DictionaryEntityRecord.parseKeyFromSortKey(record.sk);

      const operation = record.operation;
      const streamHandler = dictionaryStreams().get(record.streamName);

      if (operation) {
        if (!streamHandler) {
          throw new Error(`Stream handler ${record.streamName} does not exist`);
        }

        return await streamHandler.handler({
          dictionaryName: name,
          namespace,
          key,
          newValue: JSON.parse(record.newValue),
          newVersion: Number(record.newVersion),
          operation: operation.toLocaleLowerCase() as DictionaryStreamOperation,
          streamName: record.streamName,
          oldValue: record.oldValue ? JSON.parse(record.oldValue) : undefined,
          oldVersion: record.oldVersion ? Number(record.oldVersion) : undefined,
        });
      } else {
        return true;
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
