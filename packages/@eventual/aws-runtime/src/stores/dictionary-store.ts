import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
} from "@eventual/core";
import { DictionaryStore, getLazy, LazyValue } from "@eventual/core-runtime";
import { queryPageWithToken } from "../utils.js";

export interface AWSDictionaryStoreProps {
  dynamo: DynamoDBClient;
  entityTableName: LazyValue<string>;
}

export class AWSDictionaryStore implements DictionaryStore {
  constructor(private props: AWSDictionaryStoreProps) {}

  public async getDictionaryValue<Entity>(
    name: string,
    key: string
  ): Promise<Entity | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: DictionaryEntityRecord.key(name) },
          sk: { S: DictionaryEntityRecord.sortKey(key) },
        } satisfies Partial<DictionaryEntityRecord>,
        TableName: getLazy(this.props.entityTableName),
        AttributesToGet: ["value"],
      })
    );

    return item.Item?.["value"]?.S
      ? JSON.parse(item.Item["value"].S)
      : undefined;
  }

  public async setDictionaryValue<Entity>(
    name: string,
    key: string,
    entity: Entity
  ): Promise<void> {
    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: DictionaryEntityRecord.key(name) },
          sk: { S: DictionaryEntityRecord.sortKey(key) },
          value: { S: JSON.stringify(entity) },
        } satisfies DictionaryEntityRecord,
        TableName: getLazy(this.props.entityTableName),
      })
    );
  }

  public async deleteDictionaryValue(name: string, key: string): Promise<void> {
    await this.props.dynamo.send(
      new DeleteItemCommand({
        Key: {
          pk: { S: DictionaryEntityRecord.key(name) },
          sk: { S: DictionaryEntityRecord.sortKey(key) },
        } satisfies Partial<DictionaryEntityRecord>,
        TableName: getLazy(this.props.entityTableName),
      })
    );
  }

  public async listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>> {
    const result = await this.list(name, request, ["value", "sk"]);

    return {
      nextToken: result.nextToken,
      entries: result.records.map((r) => ({
        entity: JSON.parse(r.value.S),
        key: DictionaryEntityRecord.praseKeyFromSortKey(r.sk.S),
      })),
    };
  }

  public async listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult> {
    const result = await this.list(name, request, ["value", "sk"]);

    return {
      nextToken: result.nextToken,
      keys: result.records.map((r) =>
        DictionaryEntityRecord.praseKeyFromSortKey(r.sk.S)
      ),
    };
  }

  private list(
    name: string,
    request: DictionaryListRequest,
    fields?: string[]
  ) {
    return queryPageWithToken<DictionaryEntityRecord>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request.limit ?? 1000,
        keys: ["pk", "sk"],
        nextToken: request.nextToken,
      },
      {
        TableName: getLazy(this.props.entityTableName),
        KeyConditionExpression: "pk=:pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": { S: DictionaryEntityRecord.key(name) },
          ":sk": { S: DictionaryEntityRecord.sortKey(request.prefix ?? "") },
        },
        AttributesToGet: fields,
      }
    );
  }
}

export interface DictionaryEntityRecord
  extends Record<string, AttributeValue | undefined> {
  pk: { S: `${typeof DictionaryEntityRecord.PARTITION_KEY_PREFIX}${string}` };
  sk: { S: `${typeof DictionaryEntityRecord.SORT_KEY_PREFIX}${string}` };
  /**
   * A stringified value.
   *
   * https://dynamodbplace.com/c/questions/map-or-json-dump-string-which-is-better-to-optimize-space
   */
  value: AttributeValue.SMember;
}

export const DictionaryEntityRecord = {
  PARTITION_KEY_PREFIX: `DictEntry$`,
  key(name: string) {
    return `${this.PARTITION_KEY_PREFIX}${name}`;
  },
  SORT_KEY_PREFIX: `#`,
  sortKey(key: string) {
    return `${this.SORT_KEY_PREFIX}${key}`;
  },
  praseKeyFromSortKey(sortKey: string) {
    return sortKey.slice(1);
  },
};
