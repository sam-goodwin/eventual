import type { Entity } from "@eventual/core";
import type { WorkflowExecutor } from "../workflow/workflow-executor.js";
import { getEventualResource } from "@eventual/core/internal";

export interface EntityProvider {
  /**
   * Returns an executor which may already be started.
   *
   * Use {@link WorkflowExecutor}.isStarted to determine if it is already started.
   */
  getEntity(entityName: string): Entity | undefined;
}

/**
 * An executor provider that works with an out of memory store.
 */
export class GlobalEntityProvider implements EntityProvider {
  public getEntity(entityName: string): Entity | undefined {
    return getEventualResource("Entity", entityName);
  }
}
