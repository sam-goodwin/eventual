import { z } from "zod";

export const eventEnvelopeSchema = /* @__PURE__ */ z.object({
  name: z.string(),
  event: z.record(z.any()),
});
