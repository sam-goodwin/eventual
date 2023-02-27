import { createPublishEventsCommand } from "@eventual/core-runtime";
import { createEventClient } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createPublishEventsCommand({
    eventClient: createEventClient(),
  })
);
