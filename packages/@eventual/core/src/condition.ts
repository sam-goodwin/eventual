import { createConditionCall } from "./calls/condition-call.js";

export type ConditionPredicate = () => boolean;

export interface ConditionOptions {
  timeoutSeconds?: number;
}

/**
 * A condition which will resolve when the predicate resolves to true.
 *
 * The contents of the condition should be deterministic and contain no activity calls.
 * Should only be called from within a workflow.
 *
 * ```ts
 * workflow(async () => {
 *    let n = 0;
 *    onSignal("incSignal", () => { n++ });
 *
 *    await condition(() => n === 5); // after 5 incSignals, this promise will be resolved.
 *
 *    return "got 5!"
 * });
 * ```
 *
 * Supports a timeout to avoid running forever.
 *
 * ```ts
 * workflow(async () => {
 *    let n = 0;
 *    onSignal("incSignal", () => { n++ });
 *
 *    try {
 *       await condition({ timeoutSeconds: 5 * 60 }, () => n === 5); // after 5 incSignals, this promise will be resolved.
 *    } catch {
 *       return "did not get 5 in 5 minutes."
 *    }
 *
 *    return "got 5!"
 * });
 * ```
 */
export function condition(predicate: ConditionPredicate): Promise<void>;
export function condition(
  opts: ConditionOptions,
  predicate: ConditionPredicate
): Promise<void>;
export function condition(
  ...args:
    | [opts: ConditionOptions, predicate: ConditionPredicate]
    | [predicate: ConditionPredicate]
): Promise<void> {
  const [opts, predicate] = args.length === 1 ? [undefined, args[0]] : args;

  return createConditionCall(predicate, opts?.timeoutSeconds) as any;
}
