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
  EntityAttributes,
  EntityAttributesFromEntity,
  EntityConsistencyOptions,
  EntityQueryOptions,
  EntityQueryResult,
  EntitySetOptions,
  EntityWithMetadata,
  TransactionCancelled,
  TransactionConflict,
  UnexpectedVersion,
} from "@eventual/core";
import {
  EntityProvider,
  EntityStore,
  getLazy,
  LazyValue,
  NormalizedEntityCompositeKey,
  NormalizedEntityCompositeKeyComplete,
  NormalizedEntityKeyCompletePart,
  NormalizedEntityTransactItem,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { entityServiceTableName, queryPageWithToken } from "../utils.js";

export interface AWSEntityStoreProps {
  dynamo: DynamoDBClient;
  serviceName: LazyValue<string>;
  entityProvider: EntityProvider;
}

export type EntityAttributesWithVersion<E extends AnyEntity> =
  EntityAttributesFromEntity<E> & {
    __version: number;
  };

export type MarshalledEntityAttributesWithVersion<E extends AnyEntity> = {
  [k in keyof EntityAttributesFromEntity<E>]: AttributeValue;
} & {
  __version: AttributeValue.NMember;
};

export class AWSEntityStore extends EntityStore {
  constructor(private props: AWSEntityStoreProps) {
    super(props.entityProvider);
  }

  protected override async _getWithMetadata(
    entity: AnyEntity,
    key: NormalizedEntityCompositeKeyComplete
  ): Promise<EntityWithMetadata | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: this.entityKey(key),
        TableName: this.tableName(entity),
        ConsistentRead: true,
      })
    );

    if (!item.Item) {
      return undefined;
    }

    const { __version, ...value } = unmarshall(
      item.Item
    ) as EntityAttributesWithVersion<any>;

    // if the key attributes are computed, remove them from the return value.
    if (!(key.partition.keyAttribute in entity.attributes.shape)) {
      delete value[key.partition.keyAttribute];
    }
    if (key.sort && !(key.sort.keyAttribute in entity.attributes.shape)) {
      delete value[key.sort.keyAttribute];
    }

    return {
      value,
      version: __version,
    };
  }

  public override async _set(
    entity: AnyEntity,
    value: EntityAttributes,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntitySetOptions
  ): Promise<{ version: number }> {
    try {
      const result = await this.props.dynamo.send(
        new UpdateItemCommand({
          ...this.createSetRequest(entity, value, key, options),
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

  protected override async _delete(
    entity: AnyEntity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new DeleteItemCommand(this.createDeleteRequest(entity, key, options))
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new UnexpectedVersion("Unexpected Version");
      }
    }
  }

  private createDeleteRequest(
    entity: AnyEntity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityConsistencyOptions
  ): Delete {
    return {
      Key: this.entityKey(key),
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
      TableName: this.tableName(entity),
    };
  }

  protected override async _query(
    entity: AnyEntity,
    queryKey: NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const allAttributes = new Set([
      queryKey.partition.keyAttribute,
      ...(queryKey.sort && queryKey.sort.keyValue !== undefined
        ? [queryKey.sort.keyAttribute]
        : []),
    ]);

    const result = await queryPageWithToken<
      MarshalledEntityAttributesWithVersion<any>
    >(
      {
        dynamoClient: this.props.dynamo,
        pageSize: options?.limit ?? 1000,
        keys: queryKey.sort
          ? [queryKey.partition.keyAttribute, queryKey.sort.keyAttribute]
          : [queryKey.partition.keyAttribute],
        nextToken: options?.nextToken,
      },
      {
        TableName: this.tableName(entity),
        KeyConditionExpression:
          queryKey.sort && queryKey.sort.keyValue !== undefined
            ? queryKey.sort.partialValue
              ? `${formatAttributeNameMapKey(
                  queryKey.partition.keyAttribute
                )}=:pk AND begins_with(${formatAttributeNameMapKey(
                  queryKey.sort.keyAttribute
                )}, :sk)`
              : `${formatAttributeNameMapKey(
                  queryKey.partition.keyAttribute
                )}=:pk AND ${formatAttributeNameMapKey(
                  queryKey.sort.keyAttribute
                )}=:sk`
            : `${formatAttributeNameMapKey(
                queryKey.partition.keyAttribute
              )}=:pk`,
        ExpressionAttributeValues: {
          ":pk":
            typeof queryKey.partition.keyValue === "number"
              ? { N: queryKey.partition.keyValue.toString() }
              : { S: queryKey.partition.keyValue },
          ...(queryKey.sort && queryKey.sort.keyValue !== undefined
            ? {
                ":sk":
                  typeof queryKey.sort.keyValue === "string"
                    ? { S: queryKey.sort.keyValue }
                    : { N: queryKey.sort.keyValue.toString() },
              }
            : {}),
        },
        ExpressionAttributeNames: Object.fromEntries(
          [...allAttributes]?.map((f) => [formatAttributeNameMapKey(f), f])
        ),
      }
    );

    return {
      nextToken: result.nextToken,
      entries: result.records.map(({ __version, ...r }) => ({
        value: unmarshall(r),
        version: Number(__version.N),
      })),
    };
  }

  protected override async _transactWrite(
    items: NormalizedEntityTransactItem[]
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: items.map((item): TransactWriteItem => {
            return item.operation === "set"
              ? {
                  Update: this.createSetRequest(
                    item.entity,
                    item.value,
                    item.key,
                    item.options
                  ),
                }
              : item.operation === "delete"
              ? {
                  Delete: this.createDeleteRequest(
                    item.entity,
                    item.key,
                    item.options
                  ),
                }
              : item.operation === "condition"
              ? {
                  ConditionCheck: {
                    ConditionExpression:
                      item.version !== undefined
                        ? item.version === 0
                          ? "attribute_not_exists(#version)"
                          : "#version=:expectedVersion"
                        : undefined,
                    TableName: this.tableName(item.entity),
                    Key: this.entityKey(item.key),
                    ExpressionAttributeNames: {
                      "#version": EntityEntityRecord.VERSION_FIELD,
                    },
                    ExpressionAttributeValues:
                      item.version !== undefined
                        ? {
                            ":expectedVersion": {
                              N: item.version.toString(),
                            },
                          }
                        : undefined,
                  },
                }
              : assertNever(item);
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
        throw new TransactionConflict();
      }
      throw err;
    }
  }

  private createSetRequest<Attr extends EntityAttributes>(
    entity: AnyEntity,
    value: Attr,
    key: NormalizedEntityCompositeKey,
    options?: EntitySetOptions
  ): Update {
    const valueRecord = marshall(value, { removeUndefinedValues: true });

    // if the key attributes are not computed and are in the original value, remove them from the set expression
    delete valueRecord[key.partition.keyAttribute];
    if (key.sort) {
      delete valueRecord[key.sort.keyAttribute];
    }

    return {
      Key: this.entityKey(key),
      UpdateExpression: [
        "SET #__version=if_not_exists(#__version, :__startingVersion) + :__versionIncrement",
        ...Object.keys(valueRecord).map(
          (key) =>
            `${formatAttributeNameMapKey(key)}=${formatAttributeValueMapKey(
              key
            )}`
        ),
      ].join(","),
      ExpressionAttributeNames: {
        "#__version": "__version",
        ...Object.fromEntries(
          Object.keys(valueRecord).map((key) => [
            formatAttributeNameMapKey(key),
            key,
          ])
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
          Object.entries(valueRecord).map(([key, value]) => [
            formatAttributeValueMapKey(key),
            value,
          ])
        ),
      },
      ConditionExpression:
        options?.expectedVersion !== undefined
          ? options?.expectedVersion === 0
            ? "attribute_not_exists(#__version)"
            : "#__version=:__expectedVersion"
          : undefined,
      TableName: this.tableName(entity),
    };
  }

  private entityKey(key: NormalizedEntityCompositeKey) {
    const marshalledKey = marshall(
      {
        [key.partition.keyAttribute]: key.partition.keyValue,
        ...(key.sort ? { [key.sort.keyAttribute]: key.sort.keyValue } : {}),
      },
      { removeUndefinedValues: true }
    );
    return marshalledKey;
  }

  private tableName(entity: AnyEntity) {
    return entityServiceTableName(getLazy(this.props.serviceName), entity.name);
  }
}

export interface EntityEntityRecord
  extends Record<string, AttributeValue | undefined> {
  __version: AttributeValue.NMember;
}

export const EntityEntityRecord = {
  VERSION_FIELD: "__version",
};

function formatAttributeNameMapKey(key: string) {
  return formatAttributeMapKey(key, "#");
}

function formatAttributeValueMapKey(key: string) {
  return formatAttributeMapKey(key, ":");
}

function formatAttributeMapKey(key: string, prefix: string) {
  return `${prefix}${key.replaceAll(/[|.\- ]/g, "_")}`;
}
