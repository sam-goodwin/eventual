import "@eventual/injected/entry";

import { publishEventsRequestSchema } from "@eventual/core/internal";
import { createEventClient } from "../../create.js";
import { systemCommand } from "./system-command.js";

const eventClient = createEventClient();

export const handler = systemCommand(
  { inputSchema: publishEventsRequestSchema },
  (request) => eventClient.publishEvents(...request.events)
);
