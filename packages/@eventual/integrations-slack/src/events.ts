import { EnvelopedEvent, MessageEvent } from "@slack/bolt";

export interface MessageEventEnvelope extends EnvelopedEvent<MessageEvent> {}
