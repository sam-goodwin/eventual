// the user's entry point will register transactions as a side effect.
import "@eventual/injected/entry";

import { createTransactionWorker } from "@eventual/core-runtime";
import {
  createEntityStore,
  createEventClient,
  createExecutionQueueClient,
} from "../create.js";

export default createTransactionWorker({
  entityStore: createEntityStore(),
  eventClient: createEventClient(),
  executionQueueClient: createExecutionQueueClient(),
});
