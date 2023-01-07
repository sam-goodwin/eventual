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
