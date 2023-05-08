import type { z } from "zod";
import type {
  durationScheduleSchema,
  timeScheduleSchema,
} from "./internal/schedule.js";

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

export type DurationUnit = (typeof DURATION_UNITS)[number];

export type DurationSchedule = z.infer<typeof durationScheduleSchema>;

export type TimeSchedule = z.infer<typeof timeScheduleSchema>;

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
