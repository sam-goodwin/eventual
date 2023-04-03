import "@eventual/injected/entry";

import {
  createSubscriptionWorker,
  GlobalSubscriptionProvider,
} from "@eventual/core-runtime";
import type { EventBridgeEvent } from "aws-lambda";
import {
  createEntityClient,
  createEventClient,
  createServiceClient,
  createTransactionClient,
} from "../create.js";

export const processEvent = createSubscriptionWorker({
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
    transactionClient: createTransactionClient(),
  }),
  subscriptionProvider: new GlobalSubscriptionProvider(),
  entityClient: createEntityClient(),
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
