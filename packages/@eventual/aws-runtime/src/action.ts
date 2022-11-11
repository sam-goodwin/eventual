import { Action } from "@eventual/core";

export interface ActionWorkerRequest {
  executionId: string;
  action: Action;
}
