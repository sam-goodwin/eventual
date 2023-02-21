import "@eventual/injected/entry";

import { PublishEventsRequestSchema } from "@eventual/core";
import { createEventClient } from "../../create.js";
import { systemCommand } from "./system-command.js";

const eventClient = createEventClient();

export const handler = systemCommand(
  { input: PublishEventsRequestSchema },
  async (request) => eventClient.publishEvents(...request.events)
);
