import { z } from "zod";

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

export const durationScheduleSchema = z.object({
  type: z.literal("Duration"),
  dur: z.number(),
  unit: z.enum(DURATION_UNITS),
});

export type DurationSchedule = z.infer<typeof durationScheduleSchema>;

export const TimeScheduleSchema = z.object({
  type: z.literal("Time"),
  isoDate: z.string().datetime(),
});

export type TimeSchedule = z.infer<typeof TimeScheduleSchema>;

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
