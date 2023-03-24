import "@eventual/injected/entry";

import { createCommandWorker } from "@eventual/core-runtime";
import {
  createDictionaryClient,
  createEventClient,
  createServiceClient,
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
    // partially uses the runtime clients and partially uses the http client
    serviceClient: createServiceClient({
      eventClient: createEventClient(),
    }),
    dictionaryClient: createDictionaryClient(),
  }),
});
