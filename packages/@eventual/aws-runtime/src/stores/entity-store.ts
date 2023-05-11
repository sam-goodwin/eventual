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
  AnyEntityCompositeKey,
  EntityAttributes,
  EntityAttributesFromEntity,
  EntityConsistencyOptions,
  EntityQueryKey,
  EntityQueryOptions,
  EntityQueryResult,
  EntitySetOptions,
  EntityTransactItem,
  EntityWithMetadata,
  TransactionCancelled,
  TransactionConflict,
  UnexpectedVersion,
} from "@eventual/core";
import {
  EntityProvider,
  EntityStore,
  getLazy,
  isCompleteKey,
  isCompleteKeyPart,
  LazyValue,
  normalizeCompositeKey,
  NormalizedEntityCompositeKey,
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

export class AWSEntityStore implements EntityStore {
  constructor(private props: AWSEntityStoreProps) {}

  public async get(
    entityName: string,
    key: AnyEntityCompositeKey
  ): Promise<any> {
    return (await this.getWithMetadata(entityName, key))?.value;
  }

  public async getWithMetadata(
    entityName: string,
    key: AnyEntityCompositeKey
  ): Promise<EntityWithMetadata<any> | undefined> {
    const entity = this.getEntity(entityName);
    const normalizedCompositeKey = normalizeCompositeKey(entity, key);

    if (!isCompleteKey(normalizedCompositeKey)) {
      throw new Error("Key cannot be partial for get or getWithMetadata.");
    }

    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: this.entityKey(normalizedCompositeKey),
        TableName: this.tableName(entityName),
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
    if (
      !(
        normalizedCompositeKey.partition.keyAttribute in entity.attributes.shape
      )
    ) {
      delete value[normalizedCompositeKey.partition.keyAttribute];
    }
    if (
      normalizedCompositeKey.sort &&
      !(normalizedCompositeKey.sort.keyAttribute in entity.attributes.shape)
    ) {
      delete value[normalizedCompositeKey.sort.keyAttribute];
    }

    return {
      value,
      version: __version,
    };
  }

  public async set(
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

  public async delete(
    entityName: string,
    key: AnyEntityCompositeKey,
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
    key: AnyEntityCompositeKey,
    options?: EntityConsistencyOptions
  ): Delete {
    const entity =
      typeof _entity === "string" ? this.getEntity(_entity) : _entity;
    const normalizedKey = normalizeCompositeKey(entity, key);

    if (!isCompleteKey(normalizedKey)) {
      throw new Error("Key cannot be partial for delete.");
    }

    return {
      Key: this.entityKey(normalizedKey),
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
      TableName: this.tableName(entity.name),
    };
  }

  public async query(
    entityName: string,
    key: EntityQueryKey<any, any, any>,
    request?: EntityQueryOptions
  ): Promise<EntityQueryResult<any>> {
    const result = await this.queryEntries(entityName, key, request);
    return {
      nextToken: result.nextToken,
      entries: result.records.map(({ __version, ...r }) => ({
        value: unmarshall(r),
        version: Number(__version.N),
      })),
    };
  }

  public async transactWrite(items: EntityTransactItem[]): Promise<void> {
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
                  Key: this.entityKey(
                    normalizeCompositeKey(entity, i.operation.key)
                  ),
                  ExpressionAttributeNames: {
                    "#version": EntityEntityRecord.VERSION_FIELD,
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
        throw new TransactionConflict();
      }
      throw err;
    }
  }

  private createSetRequest<Attr extends EntityAttributes>(
    _entity: string | AnyEntity,
    value: Attr,
    options?: EntitySetOptions
  ): Update {
    const entity =
      typeof _entity === "string" ? this.getEntity(_entity) : _entity;
    const normalizedKey = normalizeCompositeKey(entity, value);

    if (!isCompleteKey(normalizedKey)) {
      throw new Error("Key cannot be partial for set.");
    }

    const valueRecord = marshall(value, { removeUndefinedValues: true });

    // if the key attributes are not computed and are in the original value, remove them from the set expression
    delete valueRecord[normalizedKey.partition.keyAttribute];
    if (normalizedKey.sort) {
      delete valueRecord[normalizedKey.sort.keyAttribute];
    }

    return {
      Key: this.entityKey(normalizedKey),
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
      TableName: this.tableName(entity.name),
    };
  }

  private getEntity(entityName: string) {
    const entity = this.props.entityProvider.getEntity(entityName);
    if (!entity) {
      throw new Error(`Entity ${entityName} was not found.`);
    }
    return entity;
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

  private queryEntries(
    entityName: string,
    queryKey: EntityQueryKey<any, any, any>,
    request?: EntityQueryOptions
  ): ReturnType<
    typeof queryPageWithToken<MarshalledEntityAttributesWithVersion<any>>
  > {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, queryKey);
    const allAttributes = new Set([
      normalizedKey.partition.keyAttribute,
      ...(normalizedKey.sort && normalizedKey.sort.keyValue !== undefined
        ? [normalizedKey.sort.keyAttribute]
        : []),
    ]);

    if (!isCompleteKeyPart(normalizedKey.partition)) {
      throw new Error("Entity partition key cannot be partial for query");
    }

    return queryPageWithToken<MarshalledEntityAttributesWithVersion<any>>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request?.limit ?? 1000,
        keys: normalizedKey.sort
          ? [
              normalizedKey.partition.keyAttribute,
              normalizedKey.sort.keyAttribute,
            ]
          : [normalizedKey.partition.keyAttribute],
        nextToken: request?.nextToken,
      },
      {
        TableName: this.tableName(entityName),
        KeyConditionExpression:
          normalizedKey.sort && normalizedKey.sort.keyValue !== undefined
            ? normalizedKey.sort.partialValue
              ? `${formatAttributeNameMapKey(
                  normalizedKey.partition.keyAttribute
                )}=:pk AND begins_with(${formatAttributeNameMapKey(
                  normalizedKey.sort.keyAttribute
                )}, :sk)`
              : `${formatAttributeNameMapKey(
                  normalizedKey.partition.keyAttribute
                )}=:pk AND ${formatAttributeNameMapKey(
                  normalizedKey.sort.keyAttribute
                )}=:sk`
            : `${formatAttributeNameMapKey(
                normalizedKey.partition.keyAttribute
              )}=:pk`,
        ExpressionAttributeValues: {
          ":pk":
            typeof normalizedKey.partition.keyValue === "number"
              ? { N: normalizedKey.partition.keyValue.toString() }
              : { S: normalizedKey.partition.keyValue },
          ...(normalizedKey.sort && normalizedKey.sort.keyValue !== undefined
            ? {
                ":sk":
                  typeof normalizedKey.sort.keyValue === "string"
                    ? { S: normalizedKey.sort.keyValue }
                    : { N: normalizedKey.sort.keyValue.toString() },
              }
            : {}),
        },
        ExpressionAttributeNames: Object.fromEntries(
          [...allAttributes]?.map((f) => [formatAttributeNameMapKey(f), f])
        ),
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

function formatAttributeNameMapKey(key: string) {
  return formatAttributeMapKey(key, "#");
}

function formatAttributeValueMapKey(key: string) {
  return formatAttributeMapKey(key, ":");
}

function formatAttributeMapKey(key: string, prefix: string) {
  return `${prefix}${key.replaceAll(/[|.\- ]/g, "_")}`;
}
