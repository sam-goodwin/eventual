import "@eventual/entry/injected";

import type { EventBridgeEvent } from "aws-lambda";
import {
  createEventHandlerWorker,
  GlobalEventHandlerProvider,
} from "@eventual/core";
import { createEventClient, createWorkflowClient } from "../clients/create.js";

export const processEvent = createEventHandlerWorker({
  workflowClient: createWorkflowClient(),
  eventClient: createEventClient(),
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
