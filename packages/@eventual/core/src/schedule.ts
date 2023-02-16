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
