import {
  AttributeValue,
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
  DictionarySetOptions,
} from "@eventual/core";
import {
  DictionaryStore,
  EntityWithMetadata,
  LazyValue,
  UnexpectedVersionResult,
  getLazy,
  normalizeCompositeKey,
} from "@eventual/core-runtime";
import { queryPageWithToken } from "../utils.js";

export interface AWSDictionaryStoreProps {
  dynamo: DynamoDBClient;
  entityTableName: LazyValue<string>;
}

export class AWSDictionaryStore implements DictionaryStore {
  constructor(private props: AWSDictionaryStoreProps) {}

  public async getDictionaryValue<Entity>(
    name: string,
    _key: string | CompositeKey
  ): Promise<EntityWithMetadata<Entity> | undefined> {
    const { key, namespace } = normalizeCompositeKey(_key);
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: DictionaryEntityRecord.key(name, namespace) },
          sk: { S: DictionaryEntityRecord.sortKey(key) },
        } satisfies Partial<DictionaryEntityRecord>,
        TableName: getLazy(this.props.entityTableName),
        AttributesToGet: ["value", "version"],
        ConsistentRead: true,
      })
    );

    if (!item.Item) {
      return undefined;
    }

    const record = item.Item as DictionaryEntityRecord;

    return {
      entity: JSON.parse(record.value.S),
      version: Number(record.version.N),
    };
  }

  public async setDictionaryValue<Entity>(
    name: string,
    _key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Promise<{ version: number } | UnexpectedVersionResult> {
    const { key, namespace } = normalizeCompositeKey(_key);
    const value = JSON.stringify(entity);
    try {
      const result = await this.props.dynamo.send(
        new UpdateItemCommand({
          Key: {
            pk: { S: DictionaryEntityRecord.key(name, namespace) },
            sk: { S: DictionaryEntityRecord.sortKey(key) },
          } satisfies Pick<DictionaryEntityRecord, "pk" | "sk">,
          UpdateExpression:
            "SET #value=:value, #version=if_not_exists(#version, :startingVersion) + :versionIncrement",
          ExpressionAttributeNames: {
            "#value": "value",
            "#version": "version",
          },
          ExpressionAttributeValues: {
            ...(options?.expectedVersion
              ? {
                  ":expectedVersion": { N: options.expectedVersion.toString() },
                }
              : undefined),
            ":value": { S: value },
            ":startingVersion": { N: "0" },
            ":versionIncrement": {
              N: options?.incrementVersion === false ? "0" : "1",
            },
          },
          ConditionExpression:
            options?.expectedVersion !== undefined
              ? options?.expectedVersion === 0
                ? "attribute_not_exists(#version)"
                : "#version=:expectedVersion"
              : undefined,
          TableName: getLazy(this.props.entityTableName),
          ReturnValues: ReturnValue.ALL_NEW,
        })
      );

      const record = result.Attributes as DictionaryEntityRecord;

      return { version: Number(record.version.N) };
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return { unexpectedVersion: true };
      }
      throw err;
    }
  }

  public async deleteDictionaryValue(
    name: string,
    _key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Promise<void | UnexpectedVersionResult> {
    const { key, namespace } = normalizeCompositeKey(_key);
    await this.props.dynamo.send(
      new DeleteItemCommand({
        Key: {
          pk: { S: DictionaryEntityRecord.key(name, namespace) },
          sk: { S: DictionaryEntityRecord.sortKey(key) },
        } satisfies Partial<DictionaryEntityRecord>,
        ConditionalOperator:
          options?.expectedVersion !== undefined
            ? "#version=:expectedVersion"
            : undefined,
        ExpressionAttributeNames:
          options?.expectedVersion !== undefined
            ? {
                "#version": "version",
              }
            : undefined,
        ExpressionAttributeValues:
          options?.expectedVersion !== undefined
            ? { ":expectedVersion": { N: options.expectedVersion.toString() } }
            : undefined,
        TableName: getLazy(this.props.entityTableName),
      })
    );
  }

  public async listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>> {
    const result = await this.list(name, request, ["value", "sk", "version"]);

    return {
      nextToken: result.nextToken,
      entries: result.records.map((r) => ({
        entity: JSON.parse(r.value.S),
        version: Number(r.version.N),
        key: DictionaryEntityRecord.parseKeyFromSortKey(r.sk.S),
      })),
    };
  }

  public async listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult> {
    const result = await this.list(name, request, ["sk"]);

    return {
      nextToken: result.nextToken,
      keys: result.records.map((r) =>
        DictionaryEntityRecord.parseKeyFromSortKey(r.sk.S)
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
          ":pk": { S: DictionaryEntityRecord.key(name, request.namespace) },
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
  version: AttributeValue.NMember;
}

export const DictionaryEntityRecord = {
  PARTITION_KEY_PREFIX: `DictEntry$`,
  key(name: string, namespace?: string) {
    return `${this.PARTITION_KEY_PREFIX}${name}$${namespace}`;
  },
  SORT_KEY_PREFIX: `#`,
  sortKey(key: string) {
    return `${this.SORT_KEY_PREFIX}${key}`;
  },
  parseKeyFromSortKey(sortKey: string) {
    return sortKey.slice(1);
  },
  parseNameAndNamespaceFromPartitionKey(sortKey: string) {
    const [name, namespace] = sortKey
      .slice(this.PARTITION_KEY_PREFIX.length)
      .split("$");
    return {
      name: name!,
      namespace: namespace && namespace.length > 0 ? namespace : undefined,
    };
  },
};
