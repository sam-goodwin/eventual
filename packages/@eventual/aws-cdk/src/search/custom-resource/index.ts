import { CloudFormationCustomResourceHandler } from "aws-lambda";
import {} from "@opensearch-project/opensearch";

export const handle: CloudFormationCustomResourceHandler = async (event) => {
  try {
    if (event.RequestType === "Create") {
    } else if (event.RequestType === "Update") {
    } else if (event.RequestType === "Delete") {
    }
  } catch (err: any) {
    await sendResult({
      status: "FAILED",
      reason: err.message,
    });
    console.error(err);
  }

  async function sendResult(
    result:
      | {
          status: "SUCCESS";
          physicalId: string;
          data: Record<string, any>;
        }
      | {
          status: "FAILED";
          physicalId?: string;
          reason: string;
        }
  ) {
    await retry({
      execute: () =>
        fetch(event.ResponseURL, {
          body: JSON.stringify({
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: result.physicalId ?? "NONE",
            Reason: result.status === "FAILED" ? result.reason : undefined,
            RequestId: event.RequestId,
            StackId: event.StackId,
            Status: result.status,
            Data: result.status === "SUCCESS" ? result.data : undefined,
          }),
        }),
    });
  }
};

async function retry<T>({
  execute,
  initDelayMs = 100,
  maxAttempts = 10,
  attemptsRemaining = maxAttempts,
  maxDelayMs = 10000,
  delayMs = initDelayMs,
}: {
  delayMs?: number;
  initDelayMs?: number;
  attemptsRemaining?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  execute: () => Promise<T>;
}): Promise<T> {
  try {
    return await execute();
  } catch (err) {
    console.error(err);
    if (attemptsRemaining > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(maxDelayMs, delayMs))
      );
      return retry({
        execute,
        attemptsRemaining,
        delayMs: delayMs * 2,
        initDelayMs,
        maxAttempts,
        maxDelayMs,
      });
    } else {
      throw new Error(`Failed after max retry attempts`);
    }
  }
}
