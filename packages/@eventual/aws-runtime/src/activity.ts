import { Command } from "@eventual/core";

export interface ActivityWorkerRequest {
  scheduledTime: string;
  executionId: string;
  command: Command;
  retry: number;
}
