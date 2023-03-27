// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import { promiseAllSettledPartitioned } from "@eventual/core-runtime";
import { dictionaries } from "@eventual/core/internal";
import { DynamoDBBatchResponse, DynamoDBRecord } from "aws-lambda";
import { DictionaryEntityRecord } from "../stores/dictionary-store.js";
import { createDictionaryClient, createServiceClient } from "../create.js";

const eventualClient = createServiceClient({});
const dictionaryClient = createDictionaryClient();

export default async (
  records: DynamoDBRecord[]
): Promise<DynamoDBBatchResponse> => {
  const dicts = dictionaries();

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      const item = record.dynamodb!.NewImage! as DictionaryEntityRecord;
      const oldItem = record.dynamodb!.OldImage as DictionaryEntityRecord;

      const name = DictionaryEntityRecord.parseNameFromPartitionKey(
        item["pk"]!.S!
      );
      const key = DictionaryEntityRecord.parseKeyFromSortKey(item["sk"]!.S!);

      const dictionary = dicts.get(name);

      if (dictionary && record.eventName) {
        const operation = record.eventName;
        const streams = dictionary?.streams.filter(
          (s) =>
            !s.options?.operations || s.options.operations.includes(operation)
        );

        const dictionaryResults = await Promise.allSettled(
          streams.map(async (s) => {
            const newValue = JSON.parse(item["value"].S);
            const oldValue =
              s.options?.includeOld && oldItem
                ? JSON.parse(oldItem["value"].S)
                : undefined;

            return await s.handler(key, newValue, operation, oldValue);
          })
        );

        // consider a result of false or an error to be a retry-able failure.
        return dictionaryResults.every(
          (r) => r.status === "fulfilled" && r.value !== false
        );
      } else {
        return true;
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
};
