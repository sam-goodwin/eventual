import type { DurationSchedule } from "./schedule.js";

export interface FunctionRuntimeProps {
  /**
   * Amount of memory in MB to allocate to the Function.
   *
   * @default 128
   */
  memorySize?: number;
  /**
   * Maximum amount of time the Function can run for before timing out.
   *
   * @default 3s
   */
  timeout?: DurationSchedule;
}
