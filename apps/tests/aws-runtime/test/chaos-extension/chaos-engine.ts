/**
 * Responsible for evaluating {@link ChaosTestConfig} to be used by runtimes.
 *
 * Runtimes invoke the engine to understand how their behavior should change.
 */
export class ChaosEngine {
  constructor(private configProvider: () => undefined | ChaosTestConfig) {}

  /**
   * Determine if a client + command pair should reject/error a request instead of making the call.
   */
  rejectOperation(clientName: string, commandName: string): boolean {
    const { disabled, rules } = this.configProvider() ?? {};

    if (!disabled && rules) {
      const matchedRules = Object.values(rules).filter((r) =>
        r.targets.some((t) =>
          isClientTarget(t)
            ? t.clientName === clientName
            : t.commandName === commandName &&
              (!t.clientName || t.clientName === clientName)
        )
      );

      return matchedRules.map((r) => r.effect).some(isRejectEffect);
    }

    return false;
  }
}

export interface ChaosTestConfig {
  disabled: boolean;
  rules?: ChaosRule[];
}

export const ChaosTargets = {
  client(clientName: string): ClientTarget {
    return { type: "Client", clientName };
  },
  command(commandName: string, clientName?: string): CommandTarget {
    return { type: "Command", clientName, commandName };
  },
};

export type Target = ClientTarget | CommandTarget;

export interface ClientTarget {
  type: "Client";
  clientName: string;
}

export function isClientTarget(target: Target): target is ClientTarget {
  return target.type === "Client";
}

export interface CommandTarget {
  type: "Command";
  clientName?: string;
  commandName: string;
}

export function isCommandTarget(target: Target): target is CommandTarget {
  return target.type === "Command";
}

export interface ChaosRule {
  name?: string;
  targets: Target[];
  effect: Effect;
}

export const ChaosEffects = {
  reject(): RejectEffect {
    return { type: "Reject" };
  },
};

export type Effect = RejectEffect;

export interface RejectEffect {
  type: "Reject";
}

export function isRejectEffect(effect: Effect): effect is RejectEffect {
  return effect.type === "Reject";
}
