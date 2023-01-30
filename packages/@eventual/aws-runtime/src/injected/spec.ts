import { AppSpec } from "@eventual/core";

/**
 * Empty {@link AppSpec} to provide typing for @eventual/injected/spec.
 * Can be a js/ts file or a .json file that exports the {@link AppSpec} schema.
 */

export default {
  workflows: [],
  subscriptions: [],
  api: { routes: [] },
} satisfies AppSpec;
