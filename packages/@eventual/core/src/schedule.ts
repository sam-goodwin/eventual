export interface RelativeSchedule {
  type: "Relative";
  timerSeconds: number;
}

export interface AbsoluteSchedule {
  type: "Absolute";
  untilTime: string;
}

export type Schedule = RelativeSchedule | AbsoluteSchedule;

export const Schedule = {
  relative(timerSeconds: number): RelativeSchedule {
    return {
      type: "Relative",
      timerSeconds,
    };
  },
  absolute(untilTime: string | Date): AbsoluteSchedule {
    return {
      type: "Absolute",
      untilTime:
        typeof untilTime === "string" ? untilTime : untilTime.toISOString(),
    };
  },
};

export function computeScheduleDate(schedule: Schedule, baseTime: Date): Date {
  return "untilTime" in schedule
    ? new Date(schedule.untilTime)
    : new Date(baseTime.getTime() + schedule.timerSeconds * 1000);
}
