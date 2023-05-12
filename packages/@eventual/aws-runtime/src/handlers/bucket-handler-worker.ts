import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import {
  createBucketNotificationHandlerWorker,
  getLazy,
  promiseAllSettledPartitioned,
} from "@eventual/core-runtime";
import { S3Handler } from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createServiceClient,
} from "../create.js";
import {
  bucketHandlerName,
  bucketName,
  serviceName,
  serviceUrl,
} from "../env.js";

const worker = createBucketNotificationHandlerWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  serviceClient: createServiceClient({}),
  serviceName,
  serviceSpec,
  serviceUrl,
});

export default (async (event) => {
  const records = event.Records;
  console.debug("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      await worker({
        bucketName: getLazy(bucketName),
        handlerName: getLazy(bucketHandlerName),
        etag: record.s3.object.eTag,
        key: record.s3.object.key,
        event:
          record.eventName === "ObjectCreated:Put"
            ? "put"
            : record.eventName === "ObjectCreated:Copy"
            ? "copy"
            : "delete",
        size: record.s3.object.size,
      });
    }
  );

  if (results.rejected.length > 0) {
    console.log(
      "Events failed \n",
      results.rejected
        .map(([record, error]) => `${record.s3.object.key} - ${error}`)
        .join("\n")
    );
  }
}) satisfies S3Handler;
