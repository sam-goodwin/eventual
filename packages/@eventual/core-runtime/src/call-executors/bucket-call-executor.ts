import type { BucketCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { BucketStore } from "../index.js";

export class BucketCallExecutor implements CallExecutor<BucketCall> {
  constructor(public bucketStore: BucketStore) {}

  public async execute(call: BucketCall) {
    // @ts-ignore - typescript won't let me case the params...
    return this.bucketStore[call.operation](call.bucketName, ...call.params);
  }
}
