import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { chunkArray } from "./utils.js";

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
    console.debug("publish", events);

    const batches = chunkArray(
      10,
      events.map((event) => [event.name, JSON.stringify(event.event)] as const)
    );

    await Promise.all(
      batches.map((batch) =>
        this._publishEvents(batch, {
          delayMs: 100,
          delayCoefficient: 2,
          remainingAttempts: 3,
          maxDelay: 1000,
        })
      )
    );
  }

  private async _publishEvents(
    events: Array<EventTuple> | ReadonlyArray<EventTuple>,
    retryConfig: RetryConfig
  ) {
    if (events.length > 0) {
      try {
        const response = await this.eventBridgeClient.send(
          new PutEventsCommand({
            Entries: events.map(([eventName, eventJson]) => ({
              DetailType: eventName,
              Detail: eventJson,
              EventBusName: this.eventBusArn,
              Source: this.serviceName,
            })),
          })
        );
        if (response.FailedEntryCount) {
          await sleep();

          const retryEvents =
            response.Entries?.flatMap((entry, i) =>
              entry.ErrorCode ? [events[i]!] : []
            ) ?? [];

          await this._publishEvents(retryEvents, backoff());
        }
      } catch (err) {
        await sleep();

        await this._publishEvents(events, backoff());
      }

      function sleep() {
        return new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(retryConfig.maxDelay, retryConfig.delayMs)
          )
        );
      }

      // increment the retry config by one attempt, cu
      function backoff() {
        return {
          ...retryConfig,
          remainingAttempts: retryConfig.remainingAttempts - 1,
          delayMs: retryConfig.delayMs & retryConfig.delayCoefficient,
        };
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
