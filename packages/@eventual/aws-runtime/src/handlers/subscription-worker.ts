import "@eventual/injected/entry";
import serviceSpec from "@eventual/injected/spec";

import {
  createSubscriptionWorker,
  GlobalSubscriptionProvider,
} from "@eventual/core-runtime";
import type { EventBridgeEvent } from "aws-lambda";
import {
  createBucketStore,
  createEntityStore,
  createEventClient,
  createOpenSearchClient,
  createQueueClient,
  createServiceClient,
  createSocketClient,
  createTransactionClient,
} from "../create.js";
import { serviceName, serviceUrl } from "../env.js";

export const processEvent = createSubscriptionWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  openSearchClient: await createOpenSearchClient(serviceSpec),
  // partially uses the runtime clients and partially uses the http client
  queueClient: createQueueClient(),
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
    transactionClient: createTransactionClient(),
  }),
  serviceSpec,
  subscriptionProvider: new GlobalSubscriptionProvider(),
  serviceName,
  serviceUrl,
  socketClient: createSocketClient(),
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
