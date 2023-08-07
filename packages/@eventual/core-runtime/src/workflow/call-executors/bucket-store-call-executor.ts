import type { GetBucketObjectResponse } from "@eventual/core";
import {
  type BucketCall,
  type BucketGetObjectSerializedResult,
  type BucketRequestFailed,
  type BucketRequestSucceeded,
  WorkflowEventType,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { BucketCallExecutor } from "../../call-executors/bucket-call-executor.js";
import { normalizeError } from "../../result.js";
import type { BucketStore } from "../../stores/bucket-store.js";
import { streamToBuffer } from "../../utils.js";
import { createEvent } from "../events.js";
import { WorkflowTaskQueueExecutorAdaptor } from "./task-queue-executor-adaptor.js";

export function createBucketWorkflowQueueExecutor(
  bucketStore: BucketStore,
  queueClient: ExecutionQueueClient
) {
  return new WorkflowTaskQueueExecutorAdaptor(
    new BucketCallExecutor(bucketStore),
    queueClient,
    async (call: BucketCall, result, { executionTime, seq }) => {
      if (call.operation.operation === "get") {
        const getResult = result as GetBucketObjectResponse;

        return createEvent<BucketRequestSucceeded>(
          {
            type: WorkflowEventType.BucketRequestSucceeded,
            operation: call.operation.operation,
            result: getResult
              ? ({
                  // serialize the data retrieved data to be stored
                  body: (await streamToBuffer(getResult.body)).toString(
                    "base64"
                  ),
                  base64Encoded: true,
                  contentLength: getResult.contentLength,
                  etag: getResult.etag,
                } satisfies BucketGetObjectSerializedResult)
              : undefined,
            seq,
          },
          executionTime
        );
      }

      return createEvent<BucketRequestSucceeded>(
        {
          type: WorkflowEventType.BucketRequestSucceeded,
          operation: call.operation.operation,
          result,
          seq,
        },
        executionTime
      );
    },
    (call, err, { executionTime, seq }) => {
      return createEvent<BucketRequestFailed>(
        {
          type: WorkflowEventType.BucketRequestFailed,
          operation: call.operation.operation,
          seq,
          ...normalizeError(err),
        },
        executionTime
      );
    }
  );
}
