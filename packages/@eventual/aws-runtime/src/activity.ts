import { Command } from "@eventual/core";

export interface ActivityWorkerRequest {
  sentTimestamp: string;
  executionId: string;
  command: Command;
  retry: number;
}
