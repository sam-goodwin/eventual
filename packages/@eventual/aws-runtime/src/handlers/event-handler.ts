import "@eventual/injected/entry";

import {
  createEventHandlerWorker,
  GlobalSubscriptionProvider,
} from "@eventual/core-runtime";
import type { EventBridgeEvent } from "aws-lambda";
import { createEventClient, createServiceClient } from "../create.js";

export const processEvent = createEventHandlerWorker({
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
  }),
  eventHandlerProvider: new GlobalSubscriptionProvider(),
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
