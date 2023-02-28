import { z } from "zod";
import { durationScheduleSchema } from "./schedule.js";

export const workflowOptionsSchema = /* @__PURE__ */ z.object({
  timeout: durationScheduleSchema.optional(),
});
