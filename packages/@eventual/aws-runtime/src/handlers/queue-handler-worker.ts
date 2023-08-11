import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import type {
  FifoQueueHandlerMessageItem,
  QueueHandlerMessageItem,
} from "@eventual/core";
import { createQueueHandlerWorker, getLazy } from "@eventual/core-runtime";
import type { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createOpenSearchClient,
  createQueueClient,
  createServiceClient,
} from "../create.js";
import { queueName, serviceName, serviceUrl } from "../env.js";

const worker = createQueueHandlerWorker({
  queueClient: createQueueClient(),
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  openSearchClient: await createOpenSearchClient(),
  serviceClient: createServiceClient({}),
  serviceSpec,
  serviceName,
  serviceUrl,
});

export default <SQSHandler>(async (event) => {
  const items: (FifoQueueHandlerMessageItem | QueueHandlerMessageItem)[] =
    event.Records.map(
      (r) =>
        ({
          id: r.messageId,
          message: r.body,
          sequenceNumber: r.attributes.SequenceNumber,
          messageDeduplicationId: r.attributes.MessageDeduplicationId,
          messageGroupId: r.attributes.MessageGroupId,
          receiptHandle: r.receiptHandle,
          receiveCount: Number(r.attributes.ApproximateReceiveCount),
          sent: new Date(r.attributes.SentTimestamp),
        } satisfies FifoQueueHandlerMessageItem | QueueHandlerMessageItem)
    );
  const result = await worker(getLazy(queueName), items);
  if (result) {
    return {
      batchItemFailures: result.failedMessageIds.map(
        (id) =>
          ({
            itemIdentifier: id,
          } satisfies SQSBatchItemFailure)
      ),
    };
  }
  return undefined;
});
