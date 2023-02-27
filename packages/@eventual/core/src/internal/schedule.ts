import { z } from "zod";
import {
  DurationSchedule,
  DurationUnit,
  DURATION_UNITS,
  Schedule,
  TimeSchedule,
} from "../schedule.js";

export function isDurationUnit(u: string): u is DurationUnit {
  return DURATION_UNITS.includes(u as any);
}

export function isDurationSchedule(
  schedule: Schedule
): schedule is DurationSchedule {
  return schedule.type === "Duration";
}

export function isTimeSchedule(schedule: Schedule): schedule is TimeSchedule {
  return schedule.type === "Time";
}

export const durationScheduleSchema = /* @__PURE__ */ z.object({
  type: z.literal("Duration"),
  dur: z.number(),
  unit: z.enum(DURATION_UNITS),
});

export const TimeScheduleSchema = /* @__PURE__ */ z.object({
  type: z.literal("Time"),
  isoDate: z.string().datetime(),
});
