import {
  AwaitDurationCall,
  AwaitTimeCall,
  createAwaitDurationCall,
  createAwaitTimeCall,
} from "./calls/await-time-call.js";
import { createEventual, EventualKind } from "./eventual.js";
import { isOrchestratorWorker } from "./runtime/flags.js";

export type DurationUnit = `${"second" | "minute" | "hour" | "day" | "year"}${
  | "s"
  | ""}`;

// TODO revisit these interfaces
export type TimeReference = Pick<AwaitTimeCall, "isoDate">;
export type DurationReference = Pick<AwaitDurationCall, "seq" | "dur" | "unit">;

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
): Promise<void> & DurationReference {
  if (!isOrchestratorWorker()) {
    // TODO: remove this limit
    throw new Error("duration is only valid in a workflow");
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
export function time(isoDate: string): Promise<void> & TimeReference;
export function time(date: Date): Promise<void> & TimeReference;
export function time(date: Date | string): Promise<void> & TimeReference {
  if (!isOrchestratorWorker()) {
    throw new Error("time is only valid in a workflow");
  }

  const d = new Date(date);
  // register a sleep command and return it (to be yielded)
  return createAwaitTimeCall(d.toISOString()) as any;
}

export function createTimeReference(iso: string): TimeReference {
  return createEventual<AwaitTimeCall>(EventualKind.AwaitTimeCall, {
    isoDate: iso,
  });
}

export function createDurationReference(
  dur: number,
  unit: DurationUnit
): DurationReference {
  return createEventual<AwaitDurationCall>(EventualKind.AwaitDurationCall, {
    dur,
    unit,
  });
}
