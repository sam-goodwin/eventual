import type { QueuePhysicalName } from "@eventual/core/internal";
import type { QueueClient } from "../clients/queue-client.js";
import type { PropertyResolver } from "../property-retriever.js";

export class QueuePhysicalNamePropertyRetriever
  implements PropertyResolver<QueuePhysicalName>
{
  constructor(private queueClient: QueueClient) {}
  public getProperty(property: QueuePhysicalName): string {
    return this.queueClient.physicalName(property.queueName);
  }
}
