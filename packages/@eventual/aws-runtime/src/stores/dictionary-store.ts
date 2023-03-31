import {
  AttributeValue,
  ConditionalCheckFailedException,
  Delete,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  TransactionCanceledException,
  TransactWriteItem,
  TransactWriteItemsCommand,
  Update,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
  DictionarySetOptions,
  DictionaryTransactItem,
} from "@eventual/core";
import {
  DictionaryStore,
  EntityWithMetadata,
  getLazy,
  LazyValue,
  normalizeCompositeKey,
  TransactionCancelledResult,
  UnexpectedVersionResult,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { entityServiceTableName, queryPageWithToken } from "../utils.js";

export interface AWSDictionaryStoreProps {
  dynamo: DynamoDBClient;
  serviceName: LazyValue<string>;
}

export class AWSDictionaryStore implements DictionaryStore {
  constructor(private props: AWSDictionaryStoreProps) {}

  public async getDictionaryValue<Entity>(
    name: string,
    _key: string | CompositeKey
  ): Promise<EntityWithMetadata<Entity> | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: this.entityKey(_key),
        TableName: this.tableName(name),
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
    try {
      const result = await this.props.dynamo.send(
        new UpdateItemCommand({
          ...this.setRequest(name, _key, entity, options),
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

  private setRequest<Entity>(
    name: string,
    _key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Update {
    const value = JSON.stringify(entity);
    return {
      Key: this.entityKey(_key),
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
      TableName: this.tableName(name),
    };
  }

  public async deleteDictionaryValue(
    name: string,
    _key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Promise<void | UnexpectedVersionResult> {
    await this.props.dynamo.send(
      new DeleteItemCommand(this.deleteRequest(name, _key, options))
    );
  }

  private deleteRequest(
    name: string,
    _key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Delete {
    return {
      Key: this.entityKey(_key),
      ConditionExpression:
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
      TableName: this.tableName(name),
    };
  }

  private entityKey(_key: string | CompositeKey) {
    const { key, namespace } = normalizeCompositeKey(_key);
    return {
      pk: { S: DictionaryEntityRecord.key(namespace) },
      sk: { S: DictionaryEntityRecord.sortKey(key) },
    } satisfies Partial<DictionaryEntityRecord>;
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

  public async transactWrite(
    items: DictionaryTransactItem<any, string>[]
  ): Promise<TransactionCancelledResult | void> {
    try {
      await this.props.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: items.map((i): TransactWriteItem => {
            if (i.operation.operation === "set") {
              return {
                Update: this.setRequest(
                  i.dictionary,
                  i.operation.key,
                  i.operation.value,
                  i.operation.options
                ),
              };
            } else if (i.operation.operation === "delete") {
              return {
                Delete: this.deleteRequest(
                  i.dictionary,
                  i.operation.key,
                  i.operation.options
                ),
              };
            } else if (i.operation.operation === "condition") {
              return {
                ConditionCheck: {
                  ConditionExpression:
                    i.operation.version !== undefined
                      ? i.operation.version === 0
                        ? "attribute_not_exists(#version)"
                        : "#version=:expectedVersion"
                      : undefined,
                  TableName: this.tableName(i.dictionary),
                  Key: this.entityKey(i.operation.key),
                  ExpressionAttributeNames: {
                    "#version": "version",
                  },
                  ExpressionAttributeValues:
                    i.operation.version !== undefined
                      ? {
                          ":expectedVersion": {
                            N: i.operation.version.toString(),
                          },
                        }
                      : undefined,
                },
              };
            }

            return assertNever(i.operation);
          }),
        })
      );
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        return {
          reasons:
            err.CancellationReasons?.map((c) => {
              // TODO: handle other failure reasons
              if (c.Code === "NONE") {
                return undefined;
              }
              return { unexpectedVersion: true };
            }) ?? [],
        };
      }
      throw err;
    }
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
        TableName: this.tableName(name),
        KeyConditionExpression: "pk=:pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": { S: DictionaryEntityRecord.key(request.namespace) },
          ":sk": { S: DictionaryEntityRecord.sortKey(request.prefix ?? "") },
        },
        AttributesToGet: fields,
      }
    );
  }

  private tableName(dictionaryName: string) {
    return entityServiceTableName(
      getLazy(this.props.serviceName),
      dictionaryName
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
  key(namespace?: string) {
    return `${this.PARTITION_KEY_PREFIX}${namespace ?? ""}`;
  },
  SORT_KEY_PREFIX: `#`,
  sortKey(key: string) {
    return `${this.SORT_KEY_PREFIX}${key}`;
  },
  parseKeyFromSortKey(sortKey: string) {
    return sortKey.slice(1);
  },
  parseNamespaceFromPartitionKey(sortKey: string): string | undefined {
    const namespace = sortKey.slice(this.PARTITION_KEY_PREFIX.length);
    return namespace ? namespace : undefined;
  },
};
