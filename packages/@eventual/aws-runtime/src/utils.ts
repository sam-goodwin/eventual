import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import { Buffer } from "buffer";

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
  return scanOrQueryPageWithToken<Item>(
    options,
    (limit, lastEvaluatedKey) =>
      new QueryCommand({
        ...query,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      })
  );
}

export async function scanPageWithToken<Item>(
  options: QueryPageWithTokenOptions,
  query: Omit<ScanCommandInput, "Limit" | "ExclusiveStartKey">
) {
  return scanOrQueryPageWithToken<Item>(
    options,
    (limit, lastEvaluatedKey) =>
      new ScanCommand({
        ...query,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      })
  );
}

async function scanOrQueryPageWithToken<Item>(
  options: QueryPageWithTokenOptions,
  scanOrQuery: (
    limit: number,
    exclusiveStartKey?: Record<string, AttributeValue>
  ) => QueryCommand | ScanCommand
) {
  const [, , payload] = options.nextToken
    ? await deserializeToken<DynamoPageNextTokenV1>(options.nextToken)
    : [];

  const result = await scanOrQueryPage<Item>(
    {
      ...options,
      exclusiveStartKey: payload,
    },
    scanOrQuery
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

async function scanOrQueryPage<Item>(
  options: QueryPageOptions,
  scanOrQuery: (
    limit: number,
    exclusiveStartKey?: Record<string, AttributeValue>
  ) => QueryCommand | ScanCommand
): Promise<{
  items: Item[];
  lastEvaluatedKey?: Record<string, any> | undefined;
}> {
  let results: Item[] = [];
  const keys = options.keys ?? ["pk", "sk"];

  let lastEvaluatedKey = options.exclusiveStartKey ?? undefined;

  do {
    const result = await options.dynamoClient.send(
      scanOrQuery(options.pageSize * 2, lastEvaluatedKey)
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

/**
 * Creates a function name with a max length of 64 characters
 *
 * The name will be the whole service name followed by the suffix trimmed to fit 64 characters.
 */
export function serviceFunctionName(serviceName: string, suffix: string) {
  const serviceNameAndSeparatorLength = serviceName.length + 1;
  const remaining = 64 - serviceNameAndSeparatorLength;
  return sanitizeFunctionName(
    `${serviceName}-${suffix.substring(0, remaining)}`
  );
}

/**
 * Bucket names must:
 * * be between 3 and 63 characters long (inc)
 * * contain only lower case characters or number, dots, and dashes.
 * * Must not contain duplicate dots
 * * must start and end with a number or letter
 * * must be unique with an AWS region
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
 */
export function serviceBucketName(serviceName: string, suffix: string) {
  const serviceNameAndSeparatorLength = serviceName.length + 1;
  const remaining = 63 - serviceNameAndSeparatorLength;
  return sanitizeBucketName(`${serviceName}-${suffix.substring(0, remaining)}`);
}

export function commandServiceFunctionSuffix(commandId: string) {
  return `command-${commandId}`;
}

export function taskServiceFunctionSuffix(taskId: string) {
  return `task-${taskId}`;
}

export function subscriptionServiceFunctionSuffix(subscriptionName: string) {
  return `subscription-${subscriptionName}`;
}

export function entityServiceTableSuffix(entityName: string) {
  return `entity-${entityName}`;
}

export function bucketServiceBucketSuffix(bucketName: string) {
  return `bucket-${bucketName}`;
}

export function queueServiceQueueSuffix(queueName: string) {
  return `queue-${queueName}`;
}

export function taskServiceFunctionName(
  serviceName: string,
  taskId: string
): string {
  return serviceFunctionName(serviceName, taskServiceFunctionSuffix(taskId));
}

export function entityServiceTableName(
  serviceName: string,
  entityName: string
): string {
  return serviceFunctionName(serviceName, entityServiceTableSuffix(entityName));
}

/**
 * Note: a bucket's name can be overridden by the user.
 */
export function bucketServiceBucketName(
  serviceName: string,
  bucketName: string
): string {
  return serviceBucketName(serviceName, bucketServiceBucketSuffix(bucketName));
}

/**
 * Note: a queue's name can be overridden by the user.
 */
export function queueServiceQueueName(
  serviceName: string,
  queueName: string
): string {
  return serviceFunctionName(serviceName, queueServiceQueueSuffix(queueName));
}

/**
 * Valid lambda function names contains letters, numbers, dash, or underscore and no spaces.
 */
export function sanitizeFunctionName(name: string) {
  return (
    name
      .replaceAll(/[^a-zA-Z0-9-_]/g, "-")
      // remove leading, trailing, and duplicate dashes
      .replaceAll(/(^-*)|(-(?=-))|(-$)/g, "")
  );
}

export function sanitizeBucketName(name: string) {
  return (
    name
      .toLowerCase()
      .replaceAll(/[^a-zA-Z0-9-.]/g, "-")
      // remove leading, trailing, and duplicate dashes
      .replaceAll(/(^-*)|(-(?=-))|(-$)/g, "")
  );
}

/**
 * Sanitizes the name of an OpenSearch Serverless Collection.
 *
 * - Starts with a lowercase letter
 * - Unique to your account and AWS Region
 * - Contains between 3 and 28 characters
 * - Contains only lowercase letters a-z, the numbers 0-9, and the hyphen (-)
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-collection.html#cfn-opensearchserverless-collection-name
 */
export function sanitizeCollectionName(name: string) {
  if (name.length < 3) {
    throw new Error(`collection name ${name} must be >=3 and <= 28 characters`);
  }
  return (
    name
      .replaceAll(/[^a-zA-Z0-9-_]/g, "-")
      // remove leading, trailing, and duplicate dashes
      .replaceAll(/(^-*)|(-(?=-))|(-$)/g, "")
      .slice(0, 28)
  );
}

export function isAwsErrorOfType<Ex extends { name: string }>(
  err: unknown,
  errName: Ex["name"]
): err is Ex {
  return (
    !!err && typeof err === "object" && "name" in err && err.name === errName
  );
}
