import { ScheduleActivityCommand } from "@eventual/core";

export interface ActivityWorkerRequest {
  scheduledTime: string;
  workflowName: string;
  executionId: string;
  command: ScheduleActivityCommand;
  retry: number;
}
