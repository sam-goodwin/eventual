import { createUpdateActivityCommand } from "@eventual/core-runtime";
import { createActivityClient } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createUpdateActivityCommand({ activityClient: createActivityClient() })
);
