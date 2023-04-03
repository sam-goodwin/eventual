import {
  AttributeValue,
  ConditionalCheckFailedException,
  Delete,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  TransactionCanceledException,
  TransactionConflictException,
  TransactWriteItem,
  TransactWriteItemsCommand,
  Update,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CompositeKey,
  EntityConsistencyOptions,
  EntityListKeysResult,
  EntityListRequest,
  EntityListResult,
  EntitySetOptions,
  EntityTransactItem,
} from "@eventual/core";
import {
  EntityStore,
  EntityWithMetadata,
  getLazy,
  LazyValue,
  normalizeCompositeKey,
  TransactionCancelledResult,
  TransactionConflictResult,
  UnexpectedVersionResult,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { entityServiceTableName, queryPageWithToken } from "../utils.js";

export interface AWSEntityStoreProps {
  dynamo: DynamoDBClient;
  serviceName: LazyValue<string>;
}

export class AWSEntityStore implements EntityStore {
  constructor(private props: AWSEntityStoreProps) {}

  public async getEntityValue<Entity>(
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

    const record = item.Item as EntityEntityRecord;

    return {
      entity: JSON.parse(record.value.S),
      version: Number(record.version.N),
    };
  }

  public async setEntityValue<Entity>(
    name: string,
    _key: string | CompositeKey,
    entity: Entity,
    options?: EntitySetOptions
  ): Promise<{ version: number } | UnexpectedVersionResult> {
    try {
      const result = await this.props.dynamo.send(
        new UpdateItemCommand({
          ...this.createSetRequest(name, _key, entity, options),
          ReturnValues: ReturnValue.ALL_NEW,
        })
      );

      const record = result.Attributes as EntityEntityRecord;

      return { version: Number(record.version.N) };
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return { unexpectedVersion: true };
      }
      throw err;
    }
  }

  private createSetRequest<Entity>(
    name: string,
    _key: string | CompositeKey,
    entity: Entity,
    options?: EntitySetOptions
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

  public async deleteEntityValue(
    name: string,
    _key: string | CompositeKey,
    options?: EntityConsistencyOptions
  ): Promise<void | UnexpectedVersionResult> {
    await this.props.dynamo.send(
      new DeleteItemCommand(this.createDeleteRequest(name, _key, options))
    );
  }

  private createDeleteRequest(
    name: string,
    _key: string | CompositeKey,
    options?: EntityConsistencyOptions
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
      pk: { S: EntityEntityRecord.key(namespace) },
      sk: { S: EntityEntityRecord.sortKey(key) },
    } satisfies Partial<EntityEntityRecord>;
  }

  public async listEntityEntries<Entity>(
    name: string,
    request: EntityListRequest
  ): Promise<EntityListResult<Entity>> {
    const result = await this.list(name, request, ["value", "sk", "version"]);

    return {
      nextToken: result.nextToken,
      entries: result.records.map((r) => ({
        entity: JSON.parse(r.value.S),
        version: Number(r.version.N),
        key: EntityEntityRecord.parseKeyFromSortKey(r.sk.S),
      })),
    };
  }

  public async listEntityKeys(
    name: string,
    request: EntityListRequest
  ): Promise<EntityListKeysResult> {
    const result = await this.list(name, request, ["sk"]);

    return {
      nextToken: result.nextToken,
      keys: result.records.map((r) =>
        EntityEntityRecord.parseKeyFromSortKey(r.sk.S)
      ),
    };
  }

  public async transactWrite(
    items: EntityTransactItem<any, string>[]
  ): Promise<TransactionCancelledResult | TransactionConflictResult | void> {
    try {
      await this.props.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: items.map((i): TransactWriteItem => {
            if (i.operation.operation === "set") {
              return {
                Update: this.createSetRequest(
                  i.entity,
                  i.operation.key,
                  i.operation.value,
                  i.operation.options
                ),
              };
            } else if (i.operation.operation === "delete") {
              return {
                Delete: this.createDeleteRequest(
                  i.entity,
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
                  TableName: this.tableName(i.entity),
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
      } else if (err instanceof TransactionConflictException) {
        return { transactionConflict: true };
      }
      throw err;
    }
  }

  private list(name: string, request: EntityListRequest, fields?: string[]) {
    return queryPageWithToken<EntityEntityRecord>(
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
          ":pk": { S: EntityEntityRecord.key(request.namespace) },
          ":sk": { S: EntityEntityRecord.sortKey(request.prefix ?? "") },
        },
        AttributesToGet: fields,
      }
    );
  }

  private tableName(entityName: string) {
    return entityServiceTableName(getLazy(this.props.serviceName), entityName);
  }
}

export interface EntityEntityRecord
  extends Record<string, AttributeValue | undefined> {
  pk: { S: `${typeof EntityEntityRecord.PARTITION_KEY_PREFIX}${string}` };
  sk: { S: `${typeof EntityEntityRecord.SORT_KEY_PREFIX}${string}` };
  /**
   * A stringified value.
   *
   * https://dynamodbplace.com/c/questions/map-or-json-dump-string-which-is-better-to-optimize-space
   */
  value: AttributeValue.SMember;
  version: AttributeValue.NMember;
}

export const EntityEntityRecord = {
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
