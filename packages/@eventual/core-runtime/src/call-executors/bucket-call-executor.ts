import type { BucketCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { BucketStore } from "../stores/bucket-store.js";

export class BucketCallExecutor implements CallExecutor<BucketCall> {
  constructor(public bucketStore: BucketStore) {}

  public async execute(call: BucketCall) {
    return this.bucketStore[call.operation.operation](
      call.operation.bucketName,
      // @ts-ignore - typescript won't let me case the params...
      ...call.operation.params
    );
  }
}
