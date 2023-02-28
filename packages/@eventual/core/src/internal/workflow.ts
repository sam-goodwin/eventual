import { z } from "zod";
import { durationScheduleSchema, timeScheduleSchema } from "./schedule.js";

export const workflowOptionsSchema = /* @__PURE__ */ z.object({
  timeout: /* @__PURE__ */ timeScheduleSchema
    .or(durationScheduleSchema)
    .optional(),
});
