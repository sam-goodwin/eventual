import { ServiceType } from "@eventual/core/internal";
import { QueueClient } from "../clients/queue-client.js";
import { SocketClient } from "../clients/socket-client.js";
import {
  AllPropertyRetriever,
  UnsupportedPropertyRetriever,
} from "../property-retriever.js";
import { BucketPhysicalNamePropertyRetriever } from "../property-retrievers/bucket-name-property-retriever.js";
import { QueuePhysicalNamePropertyRetriever } from "../property-retrievers/queue-name-property-retriever.js";
import { SocketUrlPropertyRetriever } from "../property-retrievers/socket-url-property-retriever.js";
import { BucketStore } from "../stores/bucket-store.js";

const unsupportedProperty = new UnsupportedPropertyRetriever(
  "Workflow Orchestrator"
);

export interface WorkflowPropertyRetrieverDeps {
  bucketStore: BucketStore;
  queueClient: QueueClient;
  socketClient: SocketClient;
  serviceName: string;
}

export function createDefaultWorkflowPropertyRetriever(
  deps: WorkflowPropertyRetrieverDeps
): AllPropertyRetriever {
  return new AllPropertyRetriever({
    BucketPhysicalName: new BucketPhysicalNamePropertyRetriever(
      deps.bucketStore
    ),
    OpenSearchClient: unsupportedProperty,
    QueuePhysicalName: new QueuePhysicalNamePropertyRetriever(deps.queueClient),
    ServiceClient: unsupportedProperty,
    ServiceName: deps.serviceName,
    ServiceSpec: unsupportedProperty,
    ServiceType: ServiceType.OrchestratorWorker,
    ServiceUrl: unsupportedProperty,
    SocketUrls: new SocketUrlPropertyRetriever(deps.socketClient),
    TaskToken: unsupportedProperty,
  });
}
