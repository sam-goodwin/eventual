import "@eventual/injected/entry";
import serviceSpec from "@eventual/injected/spec";

import { createCommandWorker } from "@eventual/core-runtime";
import {
  createBucketStore,
  createEntityClient,
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
    bucketStore: createBucketStore(),
    entityClient: createEntityClient(),
    // the service client, spec, and service url will be created at runtime, using a computed uri from the apigateway request
    serviceClient: undefined,
  }),
  serviceSpec,
  // pulls the service url from the request instead of env variables to reduce the circular dependency between commands and the gateway.
  serviceClientBuilder: (serviceUrl) =>
    createServiceClient({
      serviceUrl,
      eventClient: createEventClient(),
      transactionClient: createTransactionClient(),
    }),
});
