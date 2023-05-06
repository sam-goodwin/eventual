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
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  AnyEntity,
  AnyEntityKey,
  EntityConsistencyOptions,
  EntityQueryRequest,
  EntityQueryResult,
  EntitySchema,
  EntitySetOptions,
  EntityTransactItem,
  EntityValue,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import {
  convertNormalizedEntityKeyToMap,
  EntityProvider,
  EntityStore,
  getLazy,
  LazyValue,
  normalizeCompositeKey,
  normalizeKeySpec,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { entityServiceTableName, queryPageWithToken } from "../utils.js";

export interface AWSEntityStoreProps {
  dynamo: DynamoDBClient;
  serviceName: LazyValue<string>;
  entityProvider: EntityProvider;
}

export type EntitySchemaWithVersion<E extends AnyEntity> = EntitySchema<E> & {
  __version: number;
};

export type MarshalledEntitySchemaWithVersion<E extends AnyEntity> = {
  [k in keyof EntitySchema<E>]: AttributeValue;
} & {
  __version: AttributeValue.NMember;
};

export class AWSEntityStore implements EntityStore {
  constructor(private props: AWSEntityStoreProps) {}

  async get(entityName: string, key: AnyEntityKey): Promise<any> {
    return (await this.getWithMetadata(entityName, key))?.entity;
  }

  async getWithMetadata(
    entityName: string,
    key: Pick<any, string> | [p: string, s: string]
  ): Promise<{ entity: any; version: number } | undefined> {
    const entity = this.getEntity(entityName);
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: this.entityKey(key, entity),
        TableName: this.tableName(name),
        ConsistentRead: true,
      })
    );

    if (!item.Item) {
      return undefined;
    }

    const { __version, ...record } = unmarshall(
      item.Item
    ) as EntitySchemaWithVersion<any>;

    return {
      entity: record,
      version: __version,
    };
  }

  async set(
    entityName: string,
    entity: any,
    options?: EntitySetOptions | undefined
  ): Promise<{ version: number }> {
    try {
      const result = await this.props.dynamo.send(
        new UpdateItemCommand({
          ...this.createSetRequest(entityName, entity, options),
          ReturnValues: ReturnValue.ALL_NEW,
        })
      );

      const record = result.Attributes as EntityEntityRecord;

      return { version: Number(record.__version.N) };
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UnexpectedVersion("Unexpected Version");
      }
      throw err;
    }
  }

  async delete(
    entityName: string,
    key: Pick<any, string> | [p: string, s: string],
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new DeleteItemCommand(
          this.createDeleteRequest(entityName, key, options)
        )
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UnexpectedVersion("Unexpected Version");
      }
    }
  }

  private createDeleteRequest(
    _entity: string | AnyEntity,
    key: AnyEntityKey,
    options?: EntityConsistencyOptions
  ): Delete {
    const entity =
      typeof _entity === "string" ? this.getEntity(_entity) : _entity;
    return {
      Key: this.entityKey(key, entity),
      ConditionExpression:
        options?.expectedVersion !== undefined
          ? "#__version=:expectedVersion"
          : undefined,
      ExpressionAttributeNames:
        options?.expectedVersion !== undefined
          ? {
              "#__version": "__version",
            }
          : undefined,
      ExpressionAttributeValues:
        options?.expectedVersion !== undefined
          ? { ":expectedVersion": { N: options.expectedVersion.toString() } }
          : undefined,
      TableName: this.tableName(name),
    };
  }

  async query(
    entityName: string,
    request: EntityQueryRequest<any, string>
  ): Promise<EntityQueryResult<any>> {
    const result = await this.listEntries(entityName, request);
    return {
      nextToken: result.nextToken,
      entries: result.records.map(({ __version, ...r }) => ({
        entity: unmarshall(r),
        version: Number(__version.N),
      })),
    };
  }

  async transactWrite(
    items: EntityTransactItem<any, string, string | undefined>[]
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: items.map((i): TransactWriteItem => {
            if (i.operation.operation === "set") {
              return {
                Update: this.createSetRequest(
                  i.entity,
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
              const entity =
                typeof i.entity === "string"
                  ? this.getEntity(i.entity)
                  : i.entity;
              return {
                ConditionCheck: {
                  ConditionExpression:
                    i.operation.version !== undefined
                      ? i.operation.version === 0
                        ? "attribute_not_exists(#version)"
                        : "#version=:expectedVersion"
                      : undefined,
                  TableName: this.tableName(entity.name),
                  Key: this.entityKey(i.operation.key, entity),
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
        throw new TransactionCancelled(
          err.CancellationReasons?.map((r) =>
            r.Code === "NONE"
              ? undefined
              : new UnexpectedVersion("Unexpected Version")
          ) ?? []
        );
      } else if (err instanceof TransactionConflictException) {
        throw new TransactionCancelled([]);
      }
      throw err;
    }
  }

  private createSetRequest<E extends EntityValue>(
    _entity: string | AnyEntity,
    value: E,
    options?: EntitySetOptions
  ): Update {
    const entity =
      typeof _entity === "string" ? this.getEntity(_entity) : _entity;
    const valueRecord = marshall(value);
    const normalizedKey = normalizeCompositeKey(entity, valueRecord);
    delete valueRecord[normalizedKey.partition.field];
    if (normalizedKey.sort) {
      delete valueRecord[normalizedKey.sort.field];
    }
    return {
      Key: this.entityKey(value, entity),
      UpdateExpression: [
        "SET #__version=if_not_exists(#__version, :__startingVersion) + :__versionIncrement",
        ...Object.keys(valueRecord).map((key) => `#${key}=:${key}`),
      ].join(","),
      ExpressionAttributeNames: {
        "#__version": "__version",
        ...Object.fromEntries(
          Object.keys(valueRecord).map((key) => [`#${key}`, key])
        ),
      },
      ExpressionAttributeValues: {
        ...(options?.expectedVersion
          ? {
              ":__expectedVersion": { N: options.expectedVersion.toString() },
            }
          : undefined),
        ":__startingVersion": { N: "0" },
        ":__versionIncrement": {
          N: options?.incrementVersion === false ? "0" : "1",
        },
        ...Object.fromEntries(
          Object.entries(valueRecord).map(([key, value]) => [`:${key}`, value])
        ),
      },
      ConditionExpression:
        options?.expectedVersion !== undefined
          ? options?.expectedVersion === 0
            ? "attribute_not_exists(#__version)"
            : "#__version=:__expectedVersion"
          : undefined,
      TableName: this.tableName(name),
    };
  }

  private getEntity(entityName: string) {
    const entity = this.props.entityProvider.getEntity(entityName);
    if (!entity) {
      throw new Error(`Entity ${entityName} was not found.`);
    }
    return entity;
  }

  private entityKey(key: AnyEntityKey, entity: AnyEntity) {
    const compositeKey = normalizeCompositeKey(entity, key);
    const keyMap = convertNormalizedEntityKeyToMap(compositeKey);
    return marshall(keyMap);
  }

  private listEntries(
    entityName: string,
    request: EntityQueryRequest<any, any>,
    fields?: string[]
  ) {
    const entity = this.getEntity(entityName);
    const partitionKeyRef = normalizeKeySpec(entity.partitionKey);
    const sortKeyRef = entity.sortKey
      ? normalizeKeySpec(entity.sortKey)
      : undefined;
    const allFields = new Set([
      ...(fields ?? []),
      partitionKeyRef.key,
      ...(sortKeyRef ? [sortKeyRef.key] : []),
    ]);
    if (request.prefix) {
      if (!sortKeyRef?.key) {
        throw new Error(
          "Cannot use `prefix` when the entity does not have a sortKey."
        );
      } else if (sortKeyRef.type !== "string") {
        throw new Error("Sort field must be a string to use the prefix field");
      }
    }
    return queryPageWithToken<MarshalledEntitySchemaWithVersion<any>>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request.limit ?? 1000,
        keys: sortKeyRef
          ? [partitionKeyRef.key, sortKeyRef.key]
          : [partitionKeyRef.key],
        nextToken: request.nextToken,
      },
      {
        TableName: this.tableName(name),
        KeyConditionExpression: sortKeyRef
          ? `#${partitionKeyRef.key}=:pk AND begins_with(#${sortKeyRef.key}, :sk)`
          : `#${partitionKeyRef.key}=:pk`,
        ExpressionAttributeValues: {
          ":pk": { S: request.partition },
          ...(sortKeyRef ? { ":sk": { S: request.prefix ?? "" } } : {}),
        },
        ExpressionAttributeNames: Object.fromEntries(
          [...allFields]?.map((f) => [`#${f}`, f])
        ),
        ProjectionExpression: fields?.map((f) => `#${f}`).join(","),
      }
    );
  }

  private tableName(entityName: string) {
    return entityServiceTableName(getLazy(this.props.serviceName), entityName);
  }
}

export interface EntityEntityRecord
  extends Record<string, AttributeValue | undefined> {
  __version: AttributeValue.NMember;
}

export const EntityEntityRecord = {
  VERSION_FIELD: "__version",
};
