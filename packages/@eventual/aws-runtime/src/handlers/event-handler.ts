import "@eventual/injected/entry.js";

import {
  createEventHandlerWorker,
  GlobalEventHandlerProvider,
} from "@eventual/runtime-core";
import type { EventBridgeEvent } from "aws-lambda";
import { createServiceClient } from "../create.js";

export const processEvent = createEventHandlerWorker({
  serviceClient: createServiceClient(),
  eventHandlerProvider: new GlobalEventHandlerProvider(),
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
