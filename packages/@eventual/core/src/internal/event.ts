import { z } from "zod";

export const eventEnvelopeSchema = /* @__PURE__ */ z.object({
  name: /* @__PURE__ */ z.string(),
  event: /* @__PURE__ */ z.record(z.any()),
});
