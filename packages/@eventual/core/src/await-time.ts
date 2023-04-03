import {
  createEventualCall,
  EventualCallKind,
} from "./internal/calls/calls.js";
import type { EventualPromise } from "./internal/eventual-hook.js";
import {
  DurationSchedule,
  DurationUnit,
  Schedule,
  TimeSchedule,
} from "./schedule.js";

/**
 * Represents a time duration.
 *
 * Within a workflow, awaiting a duration can be used to resume in relative period of time.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *   await duration(10, "minutes"); // sleep for 10 minutes
 *   return "DONE!";
 * })
 * ```
 *
 * It behaves like any other promises, able to be aggregated with other promises.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *   const minTime = duration(10, "minutes");
 *   // wait for 10 minutes OR the duration of myTask, whichever is longer.
 *   await Promise.all([minTime, myTask()]);
 *   return "DONE";
 * })
 * ```
 *
 * A `duration` can be used to configure relative timeouts within a workflow or outside of it.
 *
 * ```ts
 * // workflow that will timeout after an hour
 * workflow("myWorkflow", { timeout: duration(1, "hour") }, async () => {
 *    // if the signal is not received within 30 minutes, the line will throw a Timeout error.
 *    await expectSignal("mySignal", { timeout: duration(30, "minutes"); });
 * });
 * ```
 *
 * Durations are computing using a simple computation of the number of standard milliseconds in a
 * period of time, not relative to the point in time, added to the milliseconds of the current execution time.
 *
 * duration(dur, unit):
 *
 * second(s) - dur * 1000
 * minute(s) - dur * 1000 * 60
 * hour(s)   - dur * 1000 * 60 * 60
 * day(s)    - dur * 1000 * 60 * 60 * 24
 * year(s)   - dur * 1000 * 60 * 60 * 24 * 365.25
 */
export function duration(
  dur: number,
  unit: DurationUnit = "seconds"
): Promise<void> & DurationSchedule {
  return getEventualCallHook().registerEventualCall(
    createEventualCall(EventualCallKind.AwaitTimerCall, {
      schedule: Schedule.duration(dur, unit),
    }),
    () => {
      return {
        type: "Duration",
        dur,
        unit,
      } as unknown as Promise<void>;
    }
  ) as EventualPromise<void> & DurationSchedule;
}

/**
 * Represents a point in time.
 *
 * Awaiting a duration can be used to resume at a point in time.
 *
 * ```ts
 * workflow("myWorkflow", async () => {
 *   await time("2024-01-03T12:00:00Z"); // wait until this date
 *   return "DONE!";
 * })
 * ```
 *
 * It behaves like any other promises, able to be aggregated with other promises.
 *
 * ```ts
 * workflow("myWorkflow", async ({ endTime }) => {
 *   const goalTime = time(endTime); // sleep for 10 minutes
 *   // wait until the given time or until the task is completed.
 *   await Promise.race([goalTime, await myTask()]);
 *   return "DONE";
 * })
 * ```
 */
export function time(isoDate: string): Promise<void> & TimeSchedule;
export function time(date: Date): Promise<void> & TimeSchedule;
export function time(date: Date | string): Promise<void> & TimeSchedule {
  const d = new Date(date);
  const iso = d.toISOString();

  return getEventualCallHook().registerEventualCall(
    createEventualCall(EventualCallKind.AwaitTimerCall, {
      schedule: Schedule.time(iso),
    }),
    () => {
      return { isoDate: iso } as unknown as Promise<void>;
    }
  ) as unknown as EventualPromise<void> & TimeSchedule;
}
