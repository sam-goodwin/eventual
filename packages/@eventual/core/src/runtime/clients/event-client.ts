import { EventEnvelope } from "../../event.js";

/**
 * A Client for emitting events into the Eventual Service's event bus.
 */
export interface EventClient {
  /**
   * Emit multiple events into the Eventual Service's event bus.
   */
  publishEvents(...event: EventEnvelope[]): Promise<void>;
}
