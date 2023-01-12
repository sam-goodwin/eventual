import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/client-dynamodb";

export interface NextTokenWrapper<Type, Payload, Version extends number = 1> {
  type: Type;
  version: Version;
  payload: Payload;
}

export type DynamoPageNextTokenV1 = NextTokenWrapper<
  "DynamoPage",
  {
    lastEvaluatedKey: Record<string, any>;
  },
  1
>;

interface BaseQueryPageOptions {
  keys?: string[];
  dynamoClient: DynamoDBClient;
  pageSize: number;
}

export interface QueryPageWithTokenOptions extends BaseQueryPageOptions {
  nextToken?: string;
}

export interface QueryPageOptions extends BaseQueryPageOptions {
  exclusiveStartKey?: Record<string, any>;
}

export async function queryPageWithToken<Item>(
  options: QueryPageWithTokenOptions,
  query: Omit<QueryCommandInput, "Limit" | "ExclusiveStartKey">
) {
  const previousNextToken = options.nextToken
    ? (JSON.parse(
        Buffer.from(options.nextToken, "base64").toString("utf-8")
      ) as DynamoPageNextTokenV1)
    : undefined;

  const result = await queryPage<Item>(
    {
      ...options,
      exclusiveStartKey: previousNextToken?.payload.lastEvaluatedKey,
    },
    query
  );

  const nextTokenObj: DynamoPageNextTokenV1 | undefined =
    result.lastEvaluatedKey
      ? {
          version: 1,
          type: "DynamoPage",
          payload: {
            lastEvaluatedKey: result.lastEvaluatedKey,
          },
        }
      : undefined;

  const newNextToken = nextTokenObj
    ? Buffer.from(JSON.stringify(nextTokenObj)).toString("base64")
    : undefined;

  return { records: result.items, nextToken: newNextToken };
}

export async function queryPage<Item>(
  options: QueryPageOptions,
  query: Omit<QueryCommandInput, "Limit" | "ExclusiveStartKey">
): Promise<{
  items: Item[];
  lastEvaluatedKey?: Record<string, any> | undefined;
}> {
  let results: Item[] = [];
  const keys = options.keys ?? ["pk", "sk"];

  let lastEvaluatedKey = options.exclusiveStartKey ?? undefined;

  do {
    const result = await options.dynamoClient.send(
      new QueryCommand({
        ...query,
        Limit: options.pageSize * 2,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (!result.Items) {
      return {
        items: results,
        lastEvaluatedKey: undefined,
      };
    }

    const leftToTake = options.pageSize - results.length;
    results = [...results, ...(result.Items.slice(0, leftToTake) as Item[])];

    // didn't return all of the items
    if (leftToTake <= result.Items.length) {
      // page is full, compute the last evaluated key as it may be different from the last returned.
      const lastItem = result.Items[leftToTake - 1]!;
      return {
        items: results,
        lastEvaluatedKey: Object.fromEntries(
          Object.entries(lastItem).filter(([key]) => keys.includes(key))
        ),
      };
    } else if (!result.LastEvaluatedKey) {
      // no more results, return
      return {
        items: results,
        lastEvaluatedKey: undefined,
      };
    } else {
      // page is not filled and there may be more results
      lastEvaluatedKey = result.LastEvaluatedKey;
    }
  } while (true);
}

/**
 * Chunks an array of {@link items} into arrays of maximum size {@link batchSize}
 */
export function chunkArray<T>(batchSize: number, items: T[]): T[][] {
  return items.reduceRight(([current, ...batches]: T[][], item) => {
    if (!current) {
      return [[item], ...(batches ?? [])];
    } else if (current?.length < batchSize) {
      return [[item, ...current], ...(batches ?? [])];
    } else {
      return [[item], current, ...(batches ?? [])];
    }
  }, []);
}
