import {
  DynamoDBClient,
  QueryCommandInput,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { INTERNAL_EXECUTION_ID_PREFIX } from "@eventual/core";

export async function promiseAllSettledPartitioned<T, R>(
  items: T[],
  op: (item: T) => Promise<R>
): Promise<{
  fulfilled: [T, Awaited<R>][];
  rejected: [T, string][];
}> {
  const results = await Promise.allSettled(items.map(op));

  const enumerated = results.map((r, i) => [r, i] as const);

  return {
    fulfilled: enumerated
      .filter(
        (t): t is [PromiseFulfilledResult<Awaited<R>>, number] =>
          t[0].status === "fulfilled"
      )
      .map(([r, i]) => [items[i]!, r.value] as [T, Awaited<R>]),
    rejected: enumerated
      .filter(
        (t): t is [PromiseRejectedResult, number] => t[0].status === "rejected"
      )
      .map(([r, i]) => [items[i]!, r.reason] as [T, string]),
  };
}

/**
 * @param parentExecutionId id of the caller execution used to compute the child workflow name
 * @param seq position that started the child workflow
 */
export function formatChildExecutionName(
  parentExecutionId: string,
  seq: number
): string {
  return `${INTERNAL_EXECUTION_ID_PREFIX}${parentExecutionId.replace(
    "/",
    "-"
  )}-${seq}`;
}

export function formatWorkflowExecutionStreamName(executionId: string) {
  return executionId;
}

export type NextTokenWrapper<Type, Payload, Version extends number = 1> = [
  type: Type,
  version: Version,
  payload: Payload
];

export enum DynamoPageType {
  DynamoPage = 0,
}

export type DynamoPageNextTokenV1 = NextTokenWrapper<
  DynamoPageType.DynamoPage,
  Record<string, any>,
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
  const [, , payload] = options.nextToken
    ? await deserializeToken<DynamoPageNextTokenV1>(options.nextToken)
    : [];

  const result = await queryPage<Item>(
    {
      ...options,
      exclusiveStartKey: payload,
    },
    query
  );

  const nextTokenObj: DynamoPageNextTokenV1 | undefined =
    result.lastEvaluatedKey
      ? [DynamoPageType.DynamoPage, 1, result.lastEvaluatedKey]
      : undefined;

  const newNextToken = nextTokenObj
    ? await serializeToken(nextTokenObj)
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

async function serializeToken(
  token: NextTokenWrapper<any, any, any>
): Promise<string> {
  return Buffer.from(JSON.stringify(token)).toString("base64");
}

async function deserializeToken<T extends NextTokenWrapper<any, any, any>>(
  str: string
): Promise<T> {
  return JSON.parse(Buffer.from(str, "base64").toString("utf-8")) as T;
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
