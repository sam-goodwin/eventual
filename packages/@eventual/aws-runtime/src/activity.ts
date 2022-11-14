import { Command } from "@eventual/core";

export interface ActivityWorkerRequest {
  executionId: string;
  command: Command;
  retry: number;
}
