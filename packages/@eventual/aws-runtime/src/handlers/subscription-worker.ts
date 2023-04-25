import "@eventual/injected/entry";
import serviceSpec from "@eventual/injected/spec";

import {
  createSubscriptionWorker,
  GlobalSubscriptionProvider,
} from "@eventual/core-runtime";
import type { EventBridgeEvent } from "aws-lambda";
import {
  createBucketStore,
  createEntityClient,
  createEventClient,
  createServiceClient,
  createTransactionClient,
} from "../create.js";
import { serviceUrl } from "../env.js";

export const processEvent = createSubscriptionWorker({
  bucketStore: createBucketStore(),
  entityClient: createEntityClient(),
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
    transactionClient: createTransactionClient(),
  }),
  serviceSpec,
  serviceUrls: [serviceUrl],
  subscriptionProvider: new GlobalSubscriptionProvider(),
});

export default async function (event: EventBridgeEvent<string, any>) {
  console.debug("received", event);
  await processEvent([
    {
      name: event["detail-type"],
      event: event.detail,
    },
  ]);
}
