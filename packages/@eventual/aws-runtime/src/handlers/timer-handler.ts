import { SQSHandler } from "aws-lambda";
import { promiseAllSettledPartitioned } from "../utils.js";
import { createWorkflowClient } from "../clients/create.js";
import { isTimerForwardEventRequest, TimerRequest } from "./types.js";

/**
 * Number of milliseconds before the timer's completion
 * that it is acceptable to send the message to it's
 * destination.
 *
 * Any number of millis above this will be waited for before sending.
 *
 * Should be driven by an estimate of the minimum time to
 * consume the message downstream.
 */
const MIN_MESSAGE_DELAY_MILLIS = 0;
/**
 * Max time to wait to send the message. If the timer came in before this threshold, fail.
 */
const MAX_MESSAGE_DELAY_MILLIS = 5 * 1000;

const workflowClient = createWorkflowClient();

export const handle: SQSHandler = async (event) => {
  console.debug(JSON.stringify(event));
  const results = await promiseAllSettledPartitioned(
    event.Records,
    async (record) => {
      const request = JSON.parse(record.body) as TimerRequest;

      const remainingMilliseconds =
        new Date(request.untilTime).getTime() - new Date().getTime();

      /**
       * If the message came here before the utilTime (minus {@link MIN_MESSAGE_DELAY_MILLIS})
       * wait that long before sending.
       *
       * SQS only support second visibility, this allows us to increase accuracy.
       *
       * If the message comes in more than {@link MAX_MESSAGE_DELAY_MILLIS} before the expected delivery time,
       * fail. We don't want to halt this lambda indefinitely. The {@link TimerClient}
       * should try to get the correct delay time.
       */
      if (remainingMilliseconds > MAX_MESSAGE_DELAY_MILLIS) {
        throw new Error(
          "Timer Messages should not show up more than a second before (5 seconds allowed) the expected trigger time."
        );
      } else if (remainingMilliseconds > MIN_MESSAGE_DELAY_MILLIS) {
        await wait(remainingMilliseconds - MIN_MESSAGE_DELAY_MILLIS);
      }

      if (isTimerForwardEventRequest(request)) {
        await workflowClient.submitWorkflowTask(
          request.executionId,
          request.event
        );
      }
    }
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

async function wait(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}
