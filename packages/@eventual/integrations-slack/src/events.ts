import { EnvelopedEvent, MessageEvent } from "@slack/bolt";

export type MessageEventEnvelope = EnvelopedEvent<MessageEvent>;
