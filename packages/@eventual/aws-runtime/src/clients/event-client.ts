/* eslint-disable @typescript-eslint/no-this-alias */
import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { chunkArray } from "../utils.js";

export interface AWSEventClientProps {
  serviceName: string;
  eventBusArn: string;
  eventBridgeClient?: EventBridgeClient;
}

type EventTuple = readonly [eventName: string, eventJson: string];

export class AWSEventClient implements EventClient {
  public readonly eventBusArn: string;
  public readonly eventBridgeClient: EventBridgeClient;
  public readonly serviceName: string;

  constructor(props: AWSEventClientProps) {
    this.serviceName = props.serviceName;
    this.eventBusArn = props.eventBusArn;
    this.eventBridgeClient =
      props.eventBridgeClient ?? new EventBridgeClient({});
  }

  public async publishEvents(
    ...events: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    const self = this;

    console.debug("publish", events);

    const eventBatches = chunkArray(
      10,
      events.map((event) => [event.name, JSON.stringify(event.event)] as const)
    );

    await Promise.all(
      eventBatches.map((batch) =>
        publishEvents(batch, {
          delayMs: 100,
          delayCoefficient: 2,
          remainingAttempts: 3,
          maxDelay: 1000,
        })
      )
    );

    async function publishEvents(
      events: Array<EventTuple> | ReadonlyArray<EventTuple>,
      retryConfig: RetryConfig
    ) {
      if (events.length > 0) {
        if (retryConfig.remainingAttempts === 0) {
          throw new Error(
            `failed to publish events to Event Bridge after exhausting all retries`
          );
        }
        try {
          const response = await self.eventBridgeClient.send(
            new PutEventsCommand({
              Entries: events.map(([eventName, eventJson]) => ({
                DetailType: eventName,
                Detail: eventJson,
                EventBusName: self.eventBusArn,
                Source: self.serviceName,
              })),
            })
          );
          if (response.FailedEntryCount) {
            console.error(
              `${
                response.FailedEntryCount
              } entries in PutEvents failed to publish to Event Bridge:\n${response.Entries?.flatMap(
                (entry) =>
                  entry.ErrorCode
                    ? [`${entry.ErrorCode}: ${entry.ErrorMessage}`]
                    : []
              ).join("\n")}`
            );
            await retry(
              response.Entries?.flatMap((entry, i) =>
                entry.ErrorCode ? [events[i]!] : []
              ) ?? []
            );
          }
        } catch (err) {
          console.error("PutEvents to EventBridge failed with error:", err);
          await retry(events);
        }
      }

      async function retry(events: EventTuple[] | readonly EventTuple[]) {
        const delayTime = Math.min(retryConfig.maxDelay, retryConfig.delayMs);
        console.debug(`Retrying after waiting ${delayTime}ms`);

        await new Promise((resolve) => setTimeout(resolve, delayTime));

        return publishEvents(events, {
          ...retryConfig,
          remainingAttempts: retryConfig.remainingAttempts - 1,
          delayMs: retryConfig.delayMs & retryConfig.delayCoefficient,
        });
      }
    }
  }
}

interface RetryConfig {
  remainingAttempts: number;
  maxDelay: number;
  delayMs: number;
  delayCoefficient: number;
}
