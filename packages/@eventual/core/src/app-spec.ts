import { Subscription } from "./event.js";

/**
 * Specification for an Eventual application
 */
export interface AppSpec {
  /**
   * A list of all event {@link Subscription}s.
   */
  subscriptions: Subscription[];
}
