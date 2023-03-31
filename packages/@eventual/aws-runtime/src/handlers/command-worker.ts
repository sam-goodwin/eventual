import "@eventual/injected/entry";

import { createCommandWorker } from "@eventual/core-runtime";
import {
  createDictionaryClient,
  createEventClient,
  createServiceClient,
  createTransactionClient,
} from "../create.js";
import { createApiGCommandAdaptor } from "./apig-command-adapter.js";

/**
 * Handle inbound command and rest api requests.
 *
 * Each command registers routes on the central router that
 * then handles the request.
 */
export default createApiGCommandAdaptor({
  commandWorker: createCommandWorker({
    dictionaryClient: createDictionaryClient(),
  }),
  // pulls the service url from the request instead of env variables to reduce the circular dependency between commands and the gateway.
  serviceClientBuilder: (serviceUrl) =>
    createServiceClient({
      serviceUrl,
      eventClient: createEventClient(),
      transactionClient: createTransactionClient(),
    }),
});
