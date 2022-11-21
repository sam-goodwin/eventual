import { EventualKind } from "./eventual.js";

/**
 * A command is an action taken to start or emit something.
 *
 * Current: Schedule Activity
 * Future: Emit Signal, Start Workflow, etc
 */
export type Command = ScheduleActivityCommand | ScheduleWorkflowCommand;

interface BaseCommand {
  seq: number;
  name: string;
}

export function isScheduleActivityCommand(
  a: Command
): a is ScheduleActivityCommand {
  return a.kind === EventualKind.ActivityCall;
}

export interface ScheduleActivityCommand extends BaseCommand {
  kind: EventualKind.ActivityCall;
  args: any[];
}

export function isScheduleWorkflowCommand(
  a: Command
): a is ScheduleWorkflowCommand {
  return a.kind === EventualKind.WorkflowCall;
}

export interface ScheduleWorkflowCommand extends BaseCommand {
  kind: EventualKind.WorkflowCall;
  input?: any;
}
