import { EventEnvelope } from "@eventual/core";

/**
 * A Client for emitting events into the Eventual Service's event bus.
 */
export interface EventClient {
  /**
   * Emit multiple events into the Eventual Service's event bus.
   */
  emitEvents(...events: EventEnvelope[]): Promise<void>;
}
