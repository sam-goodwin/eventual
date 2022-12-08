import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

export interface AWSEventClientProps {
  eventBusArn: string;
  eventBridgeClient?: EventBridgeClient;
}

export class AWSEventClient implements EventClient {
  readonly eventBusArn: string;
  readonly eventBridgeClient: EventBridgeClient;

  constructor(props: AWSEventClientProps) {
    this.eventBusArn = props.eventBusArn;
    this.eventBridgeClient =
      props.eventBridgeClient ?? new EventBridgeClient({});
  }

  async publish(...events: EventEnvelope<EventPayload>[]): Promise<void> {
    await this.eventBridgeClient.send(
      new PutEventsCommand({
        Entries: events.map((event) => ({
          DetailType: event.name,
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusArn,
        })),
      })
    );

    // TODO: handle retries
  }
}
