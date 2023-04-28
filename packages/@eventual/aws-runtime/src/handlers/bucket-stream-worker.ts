import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register streams as a side effect.
import "@eventual/injected/entry";

import {
  createBucketStreamWorker,
  getLazy,
  promiseAllSettledPartitioned
} from "@eventual/core-runtime";
import { S3Handler } from "aws-lambda";
import {
  createBucketStore,
  createEntityClient,
  createServiceClient
} from "../create.js";
import {
  bucketName,
  bucketStreamName, serviceName, serviceUrl
} from "../env.js";

const worker = createBucketStreamWorker({
  bucketStore: createBucketStore(),
  entityClient: createEntityClient(),
  serviceClient: createServiceClient({}),
  serviceName,
  serviceSpec,
  serviceUrl,
});

export default (async (event) => {
  const records = event.Records;
  console.log("records", JSON.stringify(records, undefined, 4));

  const results = await promiseAllSettledPartitioned(
    records,
    async (record) => {
      await worker({
        bucketName: getLazy(bucketName),
        streamName: getLazy(bucketStreamName),
        etag: record.s3.object.eTag,
        key: record.s3.object.key,
        operation:
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

  return;
}) satisfies S3Handler;
