// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { promiseAllSettledPartitioned } from "@eventual/core-runtime";
import {
  DictionaryStreamOperation,
  ServiceType,
  dictionaryStreams,
  registerDictionaryHook,
  registerServiceClient,
  serviceTypeScope,
} from "@eventual/core/internal";
import { DynamoDBBatchResponse, DynamoDBRecord } from "aws-lambda";
import { createDictionaryClient, createServiceClient } from "../create.js";
import { DictionaryEntityRecord } from "../stores/dictionary-store.js";
import { DictionaryStreamItem } from "@eventual/core";

const eventualClient = createServiceClient({});
const dictionaryClient = createDictionaryClient();

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

export default async (
  records: AWSDictionaryStreamItem[]
): Promise<DynamoDBBatchResponse> => {
  registerServiceClient(eventualClient);
  registerDictionaryHook(dictionaryClient);

  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await serviceTypeScope(
    ServiceType.DictionaryStreamWorker,
    async () => {
      return await promiseAllSettledPartitioned(records, async (record) => {
        try {
          const { name, namespace } =
            DictionaryEntityRecord.parseNameAndNamespaceFromPartitionKey(
              record.pk
            );
          const key = DictionaryEntityRecord.parseKeyFromSortKey(record.sk);

          const operation = record.operation;
          const streamHandler = dictionaryStreams().get(record.streamName);

          if (operation) {
            if (!streamHandler) {
              throw new Error(
                `Stream handler ${record.streamName} does not exist`
              );
            }

            const item: DictionaryStreamItem<any> = {
              dictionaryName: name,
              namespace,
              key,
              newValue: record.newValue
                ? JSON.parse(record.newValue)
                : undefined,
              newVersion: record.newVersion
                ? Number(record.newVersion)
                : (undefined as any),
              operation: operation.toLowerCase() as DictionaryStreamOperation,
              streamName: record.streamName,
              oldValue: record.oldValue
                ? JSON.parse(record.oldValue)
                : undefined,
              oldVersion: record.oldVersion
                ? Number(record.oldVersion)
                : undefined,
            };

            console.log(JSON.stringify(item, undefined, 4));

            return await streamHandler.handler(item);
          } else {
            return true;
          }
        } catch (err) {
          console.error(err);
          throw err;
        }
      });
    }
  );

  console.log(JSON.stringify(results, undefined, 4));

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
