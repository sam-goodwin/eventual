import "@eventual/injected/entry";
import serviceSpec from "@eventual/injected/spec";

import {
  createBucketStore,
  createEntityStore,
  createEventClient,
  createOpenSearchClient,
  createServiceClient,
  createTransactionClient,
} from "../create.js";
import { serviceName } from "../env.js";
import { createApiGCommandWorker } from "./apig-command-worker.js";

/**
 * Handle inbound command and rest api requests.
 *
 * Each command registers routes on the central router that
 * then handles the request.
 */
export default createApiGCommandWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  openSearchClient: await createOpenSearchClient(),
  // the service client, spec, and service url will be created at runtime, using a computed uri from the apigateway request
  // pulls the service url from the request instead of env variables to reduce the circular dependency between commands and the gateway.
  serviceClientBuilder: (serviceUrl) =>
    createServiceClient({
      serviceUrl,
      eventClient: createEventClient(),
      transactionClient: createTransactionClient(),
    }),
  serviceName,
  serviceSpec,
});
