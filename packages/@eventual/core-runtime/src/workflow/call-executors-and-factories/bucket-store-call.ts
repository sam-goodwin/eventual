import { EventualError, type GetBucketObjectResponse } from "@eventual/core";
import {
  WorkflowCallHistoryType,
  WorkflowEventType,
  isBucketCallType,
  isBucketRequestSucceededOperationType,
  type BucketCall,
  type BucketGetObjectSerializedResult,
  type BucketMethod,
  type BucketOperation,
  type BucketRequestFailed,
  type BucketRequestSucceeded,
  type CallOutput,
} from "@eventual/core/internal";
import { Readable } from "stream";
import { BucketCallExecutor } from "../../call-executors/bucket-call-executor.js";
import type { ExecutionQueueClient } from "../../clients/execution-queue-client.js";
import { Result, normalizeError } from "../../result.js";
import type { BucketStore } from "../../stores/bucket-store.js";
import { streamToBuffer } from "../../utils.js";
import { EventualFactory } from "../call-eventual-factory.js";
import { createEvent } from "../events.js";
import { EventualDefinition, Trigger } from "../eventual-definition.js";
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

/**
 * Bucket Eventuals are resolved when their Succeeded or Failed events are retrieved by the workflow queue.
 *
 * On success for GET, decode the data and put it into a stream.
 */
export class BucketCallEventualFactory implements EventualFactory<BucketCall> {
  public initializeEventual(
    call: BucketCall
  ): EventualDefinition<CallOutput<BucketCall>> {
    return {
      triggers: [
        Trigger.onWorkflowEvent(
          WorkflowEventType.BucketRequestSucceeded,
          (event) => {
            // deserialize the body to a readable stream
            if (isBucketRequestSucceededOperationType("get", event)) {
              if (event.result === undefined) {
                return Result.resolved(undefined);
              }

              const buffer = Buffer.from(
                event.result.body,
                event.result.base64Encoded ? "base64" : "utf-8"
              );

              return Result.resolved({
                contentLength: event.result.contentLength,
                etag: event.result.etag,
                body: Readable.from(buffer),
                async getBodyString(encoding) {
                  return buffer.toString(encoding);
                },
              } satisfies GetBucketObjectResponse);
            } else {
              return Result.resolved(event.result);
            }
          }
        ),
        Trigger.onWorkflowEvent(
          WorkflowEventType.BucketRequestFailed,
          (event) =>
            Result.failed(new EventualError(event.error, event.message))
        ),
      ],
      createCallEvent(seq) {
        if (isBucketCallType("put", call)) {
          // data isn't saved or compared against for bucket puts
          const [key] = call.operation.params;
          return {
            type: WorkflowCallHistoryType.BucketRequest,
            operation: {
              operation: "put",
              bucketName: call.operation.bucketName,
              key,
            },
            seq,
          };
        } else {
          return {
            type: WorkflowCallHistoryType.BucketRequest,
            operation: call.operation as BucketOperation<
              Exclude<BucketMethod, "put">
            >,
            seq,
          };
        }
      },
    };
  }
}
