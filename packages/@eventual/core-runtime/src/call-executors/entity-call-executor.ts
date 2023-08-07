import { EntityCall } from "@eventual/core/internal";
import { CallExecutor } from "../eventual-hook.js";
import { EntityStore } from "../stores/entity-store.js";

export class EntityCallExecutor implements CallExecutor<EntityCall> {
  constructor(private entityStore: EntityStore) {}
  public execute(call: EntityCall): Promise<any> {
    if (
      call.operation.operation === "queryIndex" ||
      call.operation.operation === "scanIndex"
    ) {
      return this.entityStore[call.operation.operation](
        call.operation.entityName,
        call.operation.indexName,
        ...(call.operation.params as [any])
      );
    } else if (call.operation.operation === "transact") {
      return this.entityStore.transactWrite(call.operation.items);
    }
    return this.entityStore[call.operation.operation](
      call.operation.entityName,
      ...(call.operation.params as [any])
    );
  }
}
