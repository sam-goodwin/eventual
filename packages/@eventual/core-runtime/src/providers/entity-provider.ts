import type { AnyEntity } from "@eventual/core";
import { entities } from "@eventual/core/internal";
import type { WorkflowExecutor } from "../workflow-executor.js";

export interface EntityProvider {
  /**
   * Returns an executor which may already be started.
   *
   * Use {@link WorkflowExecutor}.isStarted to determine if it is already started.
   */
  getEntity(entityName: string): AnyEntity | undefined;
}

/**
 * An executor provider that works with an out of memory store.
 */
export class GlobalEntityProvider implements EntityProvider {
  public getEntity(entityName: string): AnyEntity | undefined {
    return entities().get(entityName);
  }
}
