export class ChaosEngine {
  constructor(private configProvider: () => undefined | ChaosTestConfig) {}
  rejectOperation(clientName: string, operationName: string): boolean {
    const { disabled, rules } = this.configProvider() ?? {};

    if (!disabled && rules) {
      const matchedRules = Object.values(rules).filter((r) =>
        r.targets.some((t) =>
          isClientTarget(t)
            ? t.clientName === clientName
            : t.operationName === operationName &&
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

export type Target = ClientTarget | OperationTarget;

export interface ClientTarget {
  type: "Client";
  clientName: string;
}

export function isClientTarget(target: Target): target is ClientTarget {
  return target.type === "Client";
}

export interface OperationTarget {
  type: "Operation";
  clientName?: string;
  operationName: string;
}

export function isOperationTarget(target: Target): target is OperationTarget {
  return target.type === "Operation";
}

export interface ChaosRule {
  name?: string;
  targets: Target[];
  effect: Effect;
}

export type Effect = RejectEffect;

export interface RejectEffect {
  type: "Reject";
}

export function isRejectEffect(effect: Effect): effect is RejectEffect {
  return effect.type === "Reject";
}
