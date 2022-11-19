import { StartActivityCommand } from "@eventual/core";

export interface ActivityWorkerRequest {
  scheduledTime: string;
  executionId: string;
  command: StartActivityCommand;
  retry: number;
}
