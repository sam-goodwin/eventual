import { BucketPhysicalName } from "@eventual/core/internal";
import { EventualPropertyResolver } from "../eventual-hook.js";
import { BucketStore } from "../stores/bucket-store.js";

export class BucketPhysicalNamePropertyRetriever
  implements EventualPropertyResolver<BucketPhysicalName>
{
  constructor(private bucketStore: BucketStore) {}
  public getProperty(property: BucketPhysicalName): string {
    return this.bucketStore.physicalName(property.bucketName);
  }
}
