import { createTimerHandler, TimerRequest } from "@eventual/core";
import { SQSHandler } from "aws-lambda";
import {
  createActivityStore,
  createExecutionQueueClient,
  createLogAgent,
  createTimerClient,
} from "../create.js";
import { promiseAllSettledPartitioned } from "../utils.js";

const handleTimer = createTimerHandler({
  timerClient: createTimerClient(),
  logAgent: createLogAgent(),
  executionQueueClient: createExecutionQueueClient(),
  activityStore: createActivityStore(),
});

export const handle: SQSHandler = async (event) => {
  console.debug(JSON.stringify(event));
  const results = await promiseAllSettledPartitioned(event.Records, (record) =>
    handleTimer(JSON.parse(record.body) as TimerRequest)
  );

  if (results.rejected.length > 0) {
    console.error(
      "Requests failed: \n" +
        results.rejected
          .map(
            ([record, error]) =>
              `${record.messageId}: ${error} - ${record.body}`
          )
          .join("\n")
    );
  }

  return {
    batchItemFailures: results.rejected.map(([r]) => ({
      itemIdentifier: r.messageId,
    })),
  };
};
