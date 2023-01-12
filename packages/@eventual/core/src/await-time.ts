import {
  createAwaitDurationCall,
  createAwaitTimeCall,
} from "./calls/await-time-call.js";
import { isOrchestratorWorker } from "./runtime/flags.js";

export const DURATION_UNITS = [
  "second",
  "seconds",
  "minute",
  "minutes",
  "hour",
  "hours",
  "day",
  "days",
  "year",
  "years",
] as const;
export type DurationUnit = typeof DURATION_UNITS[number];

export function isDurationUnit(u: string): u is DurationUnit {
  return DURATION_UNITS.includes(u as any);
}

export interface TimeSpec {
  isoDate: string;
}
export interface DurationSpec {
  dur: number;
  unit: DurationUnit;
}

/**
 * ```ts
 * workflow(async () => {
 *   await duration(10, "minutes"); // sleep for 10 minutes
 *   return "DONE!";
 * })
 * ```
 */
export function duration(
  dur: number,
  unit: DurationUnit = "seconds"
): Promise<void> & DurationSpec {
  if (!isOrchestratorWorker()) {
    return { dur, unit } as Promise<void> & DurationSpec;
  }

  // register a sleep command and return it (to be yielded)
  return createAwaitDurationCall(dur, unit) as any;
}

/**
 * ```ts
 * workflow(async () => {
 *   await time("2024-01-03T12:00:00Z"); // wait until this date
 *   return "DONE!";
 * })
 * ```
 */
export function time(isoDate: string): Promise<void> & TimeSpec;
export function time(date: Date): Promise<void> & TimeSpec;
export function time(date: Date | string): Promise<void> & TimeSpec {
  const d = new Date(date);
  const iso = d.toISOString();

  if (!isOrchestratorWorker()) {
    return { isoDate: iso } as Promise<void> & TimeSpec;
  }

  // register a sleep command and return it (to be yielded)
  return createAwaitTimeCall(iso) as any;
}
