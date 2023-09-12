import type { Entity } from "@eventual/core";
import { getEventualResource } from "@eventual/core/internal";

export interface EntityProvider {
  getEntity(entityName: string): Entity | undefined;
}

export class GlobalEntityProvider implements EntityProvider {
  public getEntity(entityName: string): Entity | undefined {
    return getEventualResource("Entity", entityName);
  }
}
