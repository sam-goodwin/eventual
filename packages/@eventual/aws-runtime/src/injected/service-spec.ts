import { ServiceSpec } from "@eventual/core/internal";

/**
 * Empty {@link ServiceSpec} to provide typing for @eventual/injected/spec.
 * Can be a js/ts file or a .json file that exports the {@link ServiceSpec} schema.
 */

export default {
  workflows: [],
  transactions: [],
  events: [],
  commands: [],
  activities: [],
  subscriptions: [],
  entities: { dictionaries: [] },
} satisfies ServiceSpec;
