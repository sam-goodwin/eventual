import { z } from "zod";
import { durationScheduleSchema, timeScheduleSchema } from "./schedule.js";

export const workflowOptionsSchema = /* @__PURE__ */ z.object({
  timeout: timeScheduleSchema.or(durationScheduleSchema).optional(),
});
