import "@eventual/entry/injected";

import type { EventBridgeEvent } from "aws-lambda";
import {
  createEventHandlerWorker,
  GlobalEventHandlerProvider,
} from "@eventual/core";
import {
  createServiceClient,
  createTimerClient,
  createWorkflowRuntimeClient,
} from "../clients/create.js";

export const processEvent = createEventHandlerWorker({
  serviceClient: createServiceClient(
    createWorkflowRuntimeClient({
      executionHistoryBucket: "NOT_NEEDED",
      activityWorkerFunctionName: "NOT_NEEDED",
      tableName: "NOT_NEEDED",
      timerClient: createTimerClient({
        scheduleForwarderArn: "NOT_NEEDED",
        schedulerDlqArn: "NOT_NEEDED",
        schedulerGroup: "NOT_NEEDED",
        schedulerRoleArn: "NOT_NEEDED",
        timerQueueUrl: "NOT_NEEDED",
      }),
    })
  ),
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
