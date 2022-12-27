import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

export interface AWSEventClientProps {
  serviceName: string;
  eventBusArn: string;
  eventBridgeClient?: EventBridgeClient;
}

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

  public async publish(
    ...events: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    console.debug("publish", events);
    await this.eventBridgeClient.send(
      new PutEventsCommand({
        Entries: events.map((event) => ({
          DetailType: event.name,
          Detail: JSON.stringify(event.event),
          EventBusName: this.eventBusArn,
          Source: this.serviceName,
        })),
      })
    );

    // TODO: handle retries
  }
}
