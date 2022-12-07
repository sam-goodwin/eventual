import { SQSHandler } from "aws-lambda";
import { promiseAllSettledPartitioned } from "../utils.js";
import { createWorkflowClient } from "../clients/create.js";
import { TimerRequest } from "./types.js";
import { createTimerHandler } from "@eventual/core";

const handleTimer = createTimerHandler(createWorkflowClient());

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
