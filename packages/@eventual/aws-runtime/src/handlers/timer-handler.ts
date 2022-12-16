import { SQSHandler } from "aws-lambda";
import { promiseAllSettledPartitioned } from "../utils.js";
import {
  createActivityRuntimeClient,
  createTimerClient,
  createWorkflowClient,
} from "../clients/create.js";
import { createTimerHandler, TimerRequest } from "@eventual/core";
import { createLogger } from "@aws-lambda-powertools/logger";

const handleTimer = createTimerHandler({
  workflowClient: createWorkflowClient({
    tableName: "NOT_NEEDED",
  }),
  activityRuntimeClient: createActivityRuntimeClient(),
  timerClient: createTimerClient(),
  logger: createLogger(),
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
