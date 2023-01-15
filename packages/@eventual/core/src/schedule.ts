import { assertNever } from "./util.js";

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

export interface DurationSchedule {
  type: "Duration";
  dur: number;
  unit: DurationUnit;
}

export interface TimeSchedule {
  type: "Time";
  isoDate: string;
}

export type Schedule = DurationSchedule | TimeSchedule;

export const Schedule = {
  duration(dur: number, unit: DurationUnit = "seconds"): DurationSchedule {
    return {
      type: "Duration",
      dur,
      unit,
    };
  },
  time(isoDate: string | Date): TimeSchedule {
    return {
      type: "Time",
      isoDate: typeof isoDate === "string" ? isoDate : isoDate.toISOString(),
    };
  },
};

export function isDurationSchedule(
  schedule: Schedule
): schedule is DurationSchedule {
  return schedule.type === "Duration";
}

export function isTimeSchedule(schedule: Schedule): schedule is TimeSchedule {
  return schedule.type === "Time";
}

export function computeScheduleDate(schedule: Schedule, baseTime: Date): Date {
  return isTimeSchedule(schedule)
    ? new Date(schedule.isoDate)
    : new Date(
        baseTime.getTime() +
          computeDurationSeconds(schedule.dur, schedule.unit) * 1000
      );
}

export function computeDurationSeconds(dur: number, unit: DurationUnit) {
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
