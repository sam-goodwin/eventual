import {
  createSleepForCall,
  createSleepUntilCall,
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
