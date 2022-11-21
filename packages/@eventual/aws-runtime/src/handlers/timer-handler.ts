import { HistoryStateEvent } from "@eventual/core";
import { SQSHandler } from "aws-lambda";
import { createWorkflowClient } from "src/clients/create";

const workflowClient = createWorkflowClient();

export type TimerRequest = TimerForwardEventRequest;

export enum TimerRequestType {
  ForwardEvent = "ForwardEvent",
}

export interface TimerRequestBase<T extends TimerRequestType> {
  type: T;
  untilTime: string;
}

/**
 * Forward an event to the Workflow Queue.
 */
export interface TimerForwardEventRequest
  extends TimerRequestBase<TimerRequestType.ForwardEvent> {
  executionId: string;
  event: HistoryStateEvent;
}

function isTimerForwardEventRequest(
  timerRequest: TimerRequest
): timerRequest is TimerForwardEventRequest {
  return timerRequest && timerRequest.type === TimerRequestType.ForwardEvent;
}

export const handle: SQSHandler = async (event) => {
  const results = await promiseAllSettledPartitioned(
    event.Records,
    async (record) => {
      const request = JSON.parse(record.body) as TimerRequest;

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
