import {
  createSleepForCall,
  createSleepUntilCall,
  createSleepWhileCall,
} from "./calls/sleep-call.js";
import { isOrchestratorWorker } from "./runtime/flags.js";

/**
 * ```ts
 * eventual(async () => {
 *   await sleepFor(10 * 60); // sleep for 10 minutes
 *   return "DONE!";
 * })
 * ```
 */
export function sleepFor(seconds: number): Promise<void> {
  if (!isOrchestratorWorker()) {
    throw new Error("sleepFor is only valid in a workflow");
  }

  // register a sleep command and return it (to be yielded)
  return createSleepForCall(seconds) as any;
}

export function sleepUntil(isoDate: string): Promise<void>;
export function sleepUntil(date: Date): Promise<void>;
export function sleepUntil(date: Date | string): Promise<void> {
  if (!isOrchestratorWorker()) {
    throw new Error("sleepUntil is only valid in a workflow");
  }

  const d = new Date(date);
  // register a sleep command and return it (to be yielded)
  return createSleepUntilCall(d.toISOString()) as any;
}

export interface SleepWhilePredicate<A = any> {
  (): A;
}

export type Truthy<A> = Exclude<A, undefined | null | 0 | false | "">;
export type Falsey<A> = Extract<A, undefined | null | 0 | false | "">;

export interface SleepWhileOptions {
  timeoutSeconds?: number;
}

/**
 * Sleep while a condition is falsey.
 *
 * The contents of the condition should be deterministic and contain no activity calls.
 * Should only be called from within a workflow.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *    let n = 0;
 *    onSignal("mySignal", () => { n++ });
 *
 *    await sleepWhile(() => n < 5); // after 5 mySignals, this promise will be resolved.
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
 *    if(!(await sleepWhile({ timeoutSeconds: 5 * 60 }, () => n < 5))) {
 *       return "did not get 5 in 5 minutes."
 *    }
 *
 *    return "got 5!"
 * });
 * ```
 */
export function sleepWhile<A = any>(
  predicate: SleepWhilePredicate<A>
): Promise<Truthy<A>>;
export function sleepWhile<A = any>(
  opts: SleepWhileOptions,
  predicate: SleepWhilePredicate<A>
): Promise<Truthy<A>>;
export function sleepWhile<A = any>(
  ...args:
    | [opts: SleepWhileOptions, predicate: SleepWhilePredicate<A>]
    | [predicate: SleepWhilePredicate<A>]
): Promise<Truthy<A>> {
  const [opts, predicate] = args.length === 2 ? args : [undefined, args[0]];
  if (!isOrchestratorWorker()) {
    throw new Error("sleepWhile is only valid in a workflow");
  }

  return createSleepWhileCall(predicate, false, opts?.timeoutSeconds) as any;
}

/**
 * Sleep while a condition is truthy.
 *
 * The contents of the condition should be deterministic and contain no activity calls.
 * Should only be called from within a workflow.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *    let n = 0;
 *    onSignal("mySignal", () => { n++ });
 *
 *    await sleepWhileNot(() => n === 5); // after 5 mySignals, this promise will be resolved.
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
 *    if(!(await sleepWhileNot({ timeoutSeconds: 5 * 60 }, () => n === 5))) {
 *       return "did not get 5 in 5 minutes."
 *    }
 *
 *    return "got 5!"
 * });
 * ```
 */
export function sleepWhileNot<A = any>(
  predicate: SleepWhilePredicate<A>
): Promise<Falsey<A>>;
export function sleepWhileNot<A = any>(
  opts: SleepWhileOptions,
  predicate: SleepWhilePredicate<A>
): Promise<Falsey<A>>;
export function sleepWhileNot<A = any>(
  ...args:
    | [opts: SleepWhileOptions, predicate: SleepWhilePredicate<A>]
    | [predicate: SleepWhilePredicate<A>]
): Promise<Falsey<A>> {
  const [opts, predicate] = args.length === 2 ? args : [undefined, args[0]];
  if (!isOrchestratorWorker()) {
    throw new Error("sleepWhileNot is only valid in a workflow");
  }

  return createSleepWhileCall(predicate, true, opts?.timeoutSeconds) as any;
}
