import {
  AttributeValue,
  ConditionalCheckFailedException,
  Delete,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  Select,
  TransactionCanceledException,
  TransactionConflictException,
  TransactWriteItem,
  TransactWriteItemsCommand,
  Update,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  Attributes,
  Entity,
  EntityConsistencyOptions,
  EntityIndex,
  EntityQueryOptions,
  EntityQueryResult,
  EntityReadOptions,
  EntityScanOptions,
  EntityPutOptions,
  EntityWithMetadata,
  KeyValue,
  TransactionCancelled,
  TransactionConflict,
  UnexpectedVersion,
} from "@eventual/core";
import {
  computeGeneratedIndexKeyAttributes,
  EntityProvider,
  EntityStore,
  getLazy,
  isNormalizedEntityQueryKeyConditionPart,
  LazyValue,
  NormalizedEntityCompositeKey,
  NormalizedEntityCompositeKeyComplete,
  NormalizedEntityCompositeQueryKey,
  NormalizedEntityQueryKeyPart,
  NormalizedEntityTransactItem,
  removeGeneratedKeyAttributes,
  removeKeyAttributes,
} from "@eventual/core-runtime";
import {
  assertNever,
  isBeginsWithQueryKeyCondition,
  isBetweenQueryKeyCondition,
  isGreaterThanEqualsQueryKeyCondition,
  isGreaterThanQueryKeyCondition,
  isLessThanEqualsQueryKeyCondition,
  isLessThanQueryKeyCondition,
  KeyDefinitionPart,
} from "@eventual/core/internal";
import {
  entityServiceTableName,
  isAwsErrorOfType,
  queryPageWithToken,
  scanPageWithToken,
} from "../utils.js";

export interface AWSEntityStoreProps {
  dynamo: DynamoDBClient;
  serviceName: LazyValue<string>;
  entityProvider: EntityProvider;
}

export type EntityAttributesFromEntity<E extends Entity> = E extends Entity<
  any,
  infer Attributes,
  any,
  any
>
  ? Attributes
  : never;

export type EntityAttributesWithVersion<E extends Entity> =
  EntityAttributesFromEntity<E> & {
    __version: number;
  };

export type MarshalledEntityAttributesWithVersion<E extends Entity> = {
  [k in keyof EntityAttributesFromEntity<E>]: AttributeValue;
} & {
  __version: AttributeValue.NMember;
};

export class AWSEntityStore extends EntityStore {
  constructor(private props: AWSEntityStoreProps) {
    super(props.entityProvider);
  }

  protected override async _getWithMetadata(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityReadOptions
  ): Promise<EntityWithMetadata | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: this.entityKey(key),
        TableName: this.tableName(entity),
        ConsistentRead: options?.consistentRead,
      })
    );

    if (!item.Item) {
      return undefined;
    }

    const { __version, ...value } = unmarshall(
      item.Item
    ) as EntityAttributesWithVersion<any>;

    return {
      // the value should not contain the computed attributes, remove them before returning
      value: removeGeneratedKeyAttributes(entity, value, false, true),
      version: __version,
    };
  }

  public override async _put(
    entity: Entity,
    value: Attributes,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityPutOptions
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
      if (
        isAwsErrorOfType<ConditionalCheckFailedException>(
          err,
          "ConditionalCheckFailedException"
        )
      ) {
        throw new UnexpectedVersion("Unexpected Version");
      }
      throw err;
    }
  }

  protected override async _delete(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new DeleteItemCommand(this.createDeleteRequest(entity, key, options))
      );
    } catch (err) {
      if (
        isAwsErrorOfType<ConditionalCheckFailedException>(
          err,
          "ConditionalCheckFailedException"
        )
      ) {
        throw new UnexpectedVersion("Unexpected Version");
      }
    }
  }

  private createDeleteRequest(
    entity: Entity,
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
              "#__version": EntityEntityRecord.VERSION_FIELD,
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
    entity: Entity | EntityIndex,
    queryKey: NormalizedEntityCompositeQueryKey,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const [_entity, _index] =
      entity.kind === "Entity"
        ? [entity, undefined]
        : [this.getEntity(entity.entityName), entity];

    const partitionCondition = `${formatAttributeNameMapKey(
      queryKey.partition.keyAttribute
    )}=:pk`;

    const {
      expression: sortExpression,
      attribute: sortAttribute,
      attributeValueMap: sortAttributeValueMap,
    } = getSortKeyExpressionAndAttribute(queryKey.sort) ?? {};

    const select = options?.select
      ? [EntityEntityRecord.VERSION_FIELD, ...options.select]
      : undefined;

    const allAttributes = new Set([
      queryKey.partition.keyAttribute,
      ...(sortAttribute ? [sortAttribute] : []),
      ...(select ?? []),
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
        IndexName: _index?.name,
        ConsistentRead: options?.consistentRead,
        ScanIndexForward: !options?.direction || options?.direction === "ASC", // default is ASC, ascending
        KeyConditionExpression: sortExpression
          ? [partitionCondition, sortExpression].join(" AND ")
          : partitionCondition,
        Select: select ? Select.SPECIFIC_ATTRIBUTES : undefined,
        ProjectionExpression: select
          ? select.map(formatAttributeNameMapKey).join(", ")
          : undefined,
        ExpressionAttributeValues: {
          ":pk": keyPartAttributeValue(
            queryKey.partition,
            queryKey.partition.keyValue
          ),
          ...sortAttributeValueMap,
        },
        ExpressionAttributeNames: Object.fromEntries(
          [...allAttributes]?.map((f) => [formatAttributeNameMapKey(f), f])
        ),
      }
    );

    return {
      nextToken: result.nextToken,
      entries: result.records.map(({ __version, ...r }) => ({
        // the values should not contain the computed attributes, remove them before returning
        value: removeGeneratedKeyAttributes(
          _entity,
          unmarshall(r),
          false,
          true
        ),
        version: Number(__version.N),
      })),
    };
  }

  protected override async _scan(
    entity: Entity | EntityIndex,
    options?: EntityScanOptions<any, any>
  ): Promise<EntityQueryResult> {
    const [_entity, _index] =
      entity.kind === "Entity"
        ? [entity, undefined]
        : [this.getEntity(entity.entityName), entity];

    const select = options?.select
      ? [EntityEntityRecord.VERSION_FIELD, ...options.select]
      : undefined;

    const result = await scanPageWithToken<
      MarshalledEntityAttributesWithVersion<any>
    >(
      {
        dynamoClient: this.props.dynamo,
        pageSize: options?.limit ?? 1000,
        keys: entity.key.sort
          ? [entity.key.partition.keyAttribute, entity.key.sort.keyAttribute]
          : [entity.key.partition.keyAttribute],
        nextToken: options?.nextToken,
      },
      {
        TableName: this.tableName(entity),
        IndexName: _index?.name,
        ConsistentRead: options?.consistentRead,
        Select: select ? Select.SPECIFIC_ATTRIBUTES : undefined,
        ProjectionExpression: select
          ? select.map(formatAttributeNameMapKey).join(", ")
          : undefined,
        ExpressionAttributeNames: select
          ? Object.fromEntries(
              select.map((f) => [formatAttributeNameMapKey(f), f])
            )
          : undefined,
      }
    );

    return {
      nextToken: result.nextToken,
      entries: result.records.map(({ __version, ...r }) => ({
        // the values should not contain the computed attributes, remove them before returning
        value: removeGeneratedKeyAttributes(
          _entity,
          unmarshall(r),
          false,
          true
        ),
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
            return item.operation === "put"
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
                      item.version !== undefined && item.version !== 0
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
      if (
        isAwsErrorOfType<TransactionCanceledException>(
          err,
          "TransactionCanceledException"
        )
      ) {
        throw new TransactionCancelled(
          err.CancellationReasons?.map((r) =>
            r.Code === "NONE"
              ? undefined
              : new UnexpectedVersion("Unexpected Version")
          ) ?? []
        );
      } else if (
        isAwsErrorOfType<TransactionConflictException>(
          err,
          "TransactionConflictException"
        )
      ) {
        throw new TransactionConflict();
      }
      throw err;
    }
  }

  private createSetRequest<Attr extends Attributes>(
    entity: Entity,
    value: Attr,
    key: NormalizedEntityCompositeKey,
    options?: EntityPutOptions
  ): Update {
    const indexGeneratedAttributes = computeGeneratedIndexKeyAttributes(
      entity,
      value
    );

    /**
     * Any attribute not in the input object, but in the schema, will be removed
     */
    const missingAttributes = Object.keys(entity.attributes.shape).filter(
      (a) => !(a in value)
    );

    // remove the entity keys if they are not generated
    const valueToSave = removeKeyAttributes(
      entity,
      { ...value, ...indexGeneratedAttributes },
      undefined,
      true,
      true
    );

    // add any attributes we need for the indices to the value before marshalling
    const valueRecord = marshall(valueToSave, { removeUndefinedValues: true });

    return {
      Key: this.entityKey(key),
      UpdateExpression:
        [
          "SET #__version=if_not_exists(#__version, :__startingVersion) + :__versionIncrement",
          ...Object.keys(valueRecord).map(
            (key) =>
              `${formatAttributeNameMapKey(key)}=${formatAttributeValueMapKey(
                key
              )}`
          ),
        ].join(",") +
        (missingAttributes.length > 0
          ? ` REMOVE ${missingAttributes
              .map((a) => formatAttributeNameMapKey(a))
              .join(",")}`
          : ""),
      ExpressionAttributeNames: {
        "#__version": EntityEntityRecord.VERSION_FIELD,
        ...Object.fromEntries(
          Object.keys(valueRecord).map((key) => [
            formatAttributeNameMapKey(key),
            key,
          ])
        ),
        ...Object.fromEntries(
          missingAttributes.map((m) => [formatAttributeNameMapKey(m), m])
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
    console.debug("Key", JSON.stringify(key));
    const marshalledKey = marshall(
      {
        [key.partition.keyAttribute]: key.partition.keyValue,
        ...(key.sort ? { [key.sort.keyAttribute]: key.sort.keyValue } : {}),
      },
      { removeUndefinedValues: true }
    );
    console.debug("Marshalled Key", JSON.stringify(marshalledKey));
    return marshalledKey;
  }

  private tableName(entity: Entity | EntityIndex) {
    return entityServiceTableName(
      getLazy(this.props.serviceName),
      entity.kind === "EntityIndex" ? entity.entityName : entity.name
    );
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

function getSortKeyExpressionAndAttribute(
  keyPart?: NormalizedEntityQueryKeyPart
):
  | undefined
  | {
      expression: string;
      attribute: string;
      attributeValueMap: Record<string, AttributeValue>;
    } {
  // sort key is undefined, return undefined
  if (!keyPart) {
    return undefined;
  }

  const attributeNameKey = formatAttributeNameMapKey(keyPart.keyAttribute);

  // if the key part is a condition key part
  if (isNormalizedEntityQueryKeyConditionPart(keyPart)) {
    if (isBetweenQueryKeyCondition(keyPart.condition)) {
      return {
        attribute: keyPart.keyAttribute,
        expression: `${attributeNameKey} BETWEEN :skLeft AND :skRight`,
        attributeValueMap: {
          ":skLeft": keyPartAttributeValue(
            keyPart,
            keyPart.condition.$between[0]
          ),
          ":skRight": keyPartAttributeValue(
            keyPart,
            keyPart.condition.$between[1]
          ),
        },
      };
    } else {
      const [value, expression] = isBeginsWithQueryKeyCondition(
        keyPart.condition
      )
        ? [
            keyPart.condition.$beginsWith,
            `begins_with(${attributeNameKey}, :sk)`,
          ]
        : isLessThanQueryKeyCondition(keyPart.condition)
        ? [keyPart.condition.$lt, `${attributeNameKey} < :sk`]
        : isLessThanEqualsQueryKeyCondition(keyPart.condition)
        ? [keyPart.condition.$lte, `${attributeNameKey} <= :sk`]
        : isGreaterThanQueryKeyCondition(keyPart.condition)
        ? [keyPart.condition.$gt, `${attributeNameKey} > :sk`]
        : isGreaterThanEqualsQueryKeyCondition(keyPart.condition)
        ? [keyPart.condition.$gte, `${attributeNameKey} >= :sk`]
        : assertNever(keyPart.condition);

      return {
        expression,
        attribute: keyPart.keyAttribute,
        attributeValueMap: {
          ":sk": keyPartAttributeValue(keyPart, value),
        },
      };
    }
  } else if (keyPart.keyValue === undefined) {
    // if the key value is undefined (no key part attributes given), return undefined.
    return undefined;
  }
  // finally, format the prefix or exact match use cases based on if the key part attributes are partial or not.
  return {
    expression: keyPart.partialValue
      ? `begins_with(${attributeNameKey}, :sk)`
      : `${attributeNameKey}=:sk`,
    attribute: keyPart.keyAttribute,
    attributeValueMap: {
      ":sk": keyPartAttributeValue(keyPart, keyPart.keyValue),
    },
  };
}

/**
 * Given a key part, format the value based on the key part's type.
 */
function keyPartAttributeValue(
  part: KeyDefinitionPart,
  value: KeyValue
): AttributeValue {
  return part.type === "string"
    ? { S: value.toString() }
    : { N: value.toString() };
}
