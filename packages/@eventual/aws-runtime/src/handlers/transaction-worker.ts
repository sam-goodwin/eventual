// the user's entry point will register transactions as a side effect.
import "@eventual/injected/entry";

import {
  createTransactionWorker,
  GlobalEntityProvider,
} from "@eventual/core-runtime";
import {
  createEntityStore,
  createEventClient,
  createExecutionQueueClient,
} from "../create.js";
import { serviceName } from "../env.js";

export default createTransactionWorker({
  entityStore: createEntityStore(),
  entityProvider: new GlobalEntityProvider(),
  eventClient: createEventClient(),
  executionQueueClient: createExecutionQueueClient(),
  serviceName,
});
