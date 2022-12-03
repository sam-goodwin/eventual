import { createConditionCall } from "./calls/condition-call.js";

export type ConditionPredicate = () => boolean;

export function condition(predicate: ConditionPredicate): Promise<void>;
export function condition(
  opts: { timeoutSeconds: number },
  predicate: ConditionPredicate
): Promise<void>;
export function condition(
  ...args:
    | [opts: { timeoutSeconds: number }, predicate: ConditionPredicate]
    | [predicate: ConditionPredicate]
): Promise<void> {
  const [opts, predicate] = args.length === 1 ? [undefined, args[0]] : args;

  return createConditionCall(predicate, opts?.timeoutSeconds) as any;
}
