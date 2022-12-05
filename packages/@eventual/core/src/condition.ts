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
 * Supports a timeout to avoid running forever. When the condition times out, it returns false.
 *
 * ```ts
 * workflow(async () => {
 *    let n = 0;
 *    onSignal("incSignal", () => { n++ });
 *
 *    // after 5 incSignals, this promise will be resolved.
 *    if(!(await condition({ timeoutSeconds: 5 * 60 }, () => n === 5))) {
 *       return "did not get 5 in 5 minutes."
 *    }
 *
 *    return "got 5!"
 * });
 * ```
 */
export function condition(predicate: ConditionPredicate): Promise<boolean>;
export function condition(
  opts: ConditionOptions,
  predicate: ConditionPredicate
): Promise<boolean>;
export function condition(
  ...args:
    | [opts: ConditionOptions, predicate: ConditionPredicate]
    | [predicate: ConditionPredicate]
): Promise<boolean> {
  const [opts, predicate] = args.length === 1 ? [undefined, args[0]] : args;

  return createConditionCall(predicate, opts?.timeoutSeconds) as any;
}
