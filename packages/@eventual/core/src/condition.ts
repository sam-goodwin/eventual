import {
  createEventualCall,
  EventualCallKind,
} from "./internal/calls/calls.js";

export type ConditionPredicate = () => boolean;

export interface ConditionOptions {
  timeout?: Promise<any>;
}

/**
 * A condition which will resolve when the predicate resolves to true.
 *
 * The contents of the condition should be deterministic and contain no activity calls.
 * Should only be called from within a workflow.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *    let n = 0;
 *    onSignal("mySignal", () => { n++ });
 *
 *    await condition(() => n === 5); // after 5 mySignals, this promise will be resolved.
 *
 *    return "got 5!"
 * });
 * ```
 *
 * Supports a timeout to avoid running forever. When the condition times out, it returns false.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *    let n = 0;
 *    onSignal("mySignal", () => { n++ });
 *
 *    // after 5 mySignals, this promise will be resolved.
 *    if(!(await condition({ timeout: duration(5, "minutes") }, () => n === 5))) {
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

  return getEventualCallHook().registerEventualCall(
    createEventualCall(EventualCallKind.ConditionCall, {
      predicate,
      timeout: opts?.timeout,
    }),
    () => {
      throw new Error("condition is only valid in a workflow");
    }
  );
}
