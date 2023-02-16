import { DurationSchedule, DurationUnit, Schedule } from "@eventual/core";
import { assertNever, isTimeSchedule } from "@eventual/core/internal";

export function computeScheduleDate(schedule: Schedule, baseTime: Date): Date {
  return isTimeSchedule(schedule)
    ? new Date(schedule.isoDate)
    : new Date(baseTime.getTime() + computeDurationSeconds(schedule) * 1000);
}

export function computeDurationSeconds(
  ...args: [dur: number, unit: DurationUnit] | [duration: DurationSchedule]
): number {
  const [dur, unit] = args.length === 1 ? [args[0].dur, args[0].unit] : args;
  return unit === "seconds" || unit === "second"
    ? dur
    : unit === "minutes" || unit === "minute"
    ? dur * 60
    : unit === "hours" || unit === "hour"
    ? dur * 60 * 60
    : unit === "days" || unit === "day"
    ? dur * 60 * 60 * 24
    : unit === "years" || unit === "year"
    ? dur * 60 * 60 * 24 * 365.25
    : assertNever(unit);
}
