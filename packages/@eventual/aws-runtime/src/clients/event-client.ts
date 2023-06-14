/* eslint-disable @typescript-eslint/no-this-alias */
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { EventEnvelope, EventPayload } from "@eventual/core";
import { EventClient, LazyValue, getLazy } from "@eventual/core-runtime";
import { getEventualResource } from "@eventual/core/internal";
import { chunkArray } from "../utils.js";

export interface AWSEventClientProps {
  serviceName: LazyValue<string>;
  eventBusArn: LazyValue<string>;
  eventBridgeClient: EventBridgeClient;
}

type EventTuple = readonly [eventName: string, eventJson: string];

export class AWSEventClient implements EventClient {
  constructor(private props: AWSEventClientProps) {}

  public async emitEvents(
    ...events: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    const self = this;

    console.debug("emit", events);

    const eventBatches = chunkArray(
      10,
      events.map((event, i) => {
        const schema = getEventualResource("events", event.name)?.schema;
        if (schema) {
          const result = schema.safeParse(event.event);
          if (!result.success) {
            const errorMessages = result.error.errors.map(
              (error) =>
                `${error.code}(${error.path.join(".")}): ${error.message}`
            );
            throw new Error(
              `event ${i} did not match the provided schema: [${errorMessages.join(
                ", "
              )}]`
            );
          }
        }

        return [event.name, JSON.stringify(event.event)] as const;
      })
    );

    await Promise.all(
      eventBatches.map((batch) =>
        emitEvents(batch, {
          delayMs: 100,
          delayCoefficient: 2,
          remainingAttempts: 3,
          maxDelay: 1000,
        })
      )
    );

    async function emitEvents(
      events: Array<EventTuple> | ReadonlyArray<EventTuple>,
      retryConfig: RetryConfig
    ) {
      if (events.length > 0) {
        if (retryConfig.remainingAttempts === 0) {
          throw new Error(
            `failed to emit events to Event Bridge after exhausting all retries`
          );
        }
        try {
          const response = await self.props.eventBridgeClient.send(
            new PutEventsCommand({
              Entries: events.map(([eventName, eventJson]) => ({
                DetailType: eventName,
                Detail: eventJson,
                EventBusName: getLazy(self.props.eventBusArn),
                Source: getLazy(self.props.serviceName),
              })),
            })
          );
          if (response.FailedEntryCount) {
            console.error(
              `${
                response.FailedEntryCount
              } entries in PutEvents failed to emit to Event Bridge:\n${response.Entries?.flatMap(
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

        return emitEvents(events, {
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
