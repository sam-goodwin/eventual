import type { BucketPhysicalName } from "@eventual/core/internal";
import type { PropertyResolver } from "../property-retriever.js";
import type { BucketStore } from "../stores/bucket-store.js";

export class BucketPhysicalNamePropertyRetriever
  implements PropertyResolver<BucketPhysicalName>
{
  constructor(private bucketStore: BucketStore) {}
  public getProperty(property: BucketPhysicalName): string {
    return this.bucketStore.physicalName(property.bucketName);
  }
}
