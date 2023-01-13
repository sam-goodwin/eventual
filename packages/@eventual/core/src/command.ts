import { EventEnvelope } from "./event.js";
import { Schedule } from "./index.js";
import { SignalTarget } from "./signals.js";
import { WorkflowOptions } from "./workflow.js";

export type Command =
  | StartTimerCommand
  | ScheduleActivityCommand
  | ScheduleWorkflowCommand
  | PublishEventsCommand
  | SendSignalCommand;

interface CommandBase<T extends CommandType> {
  kind: T;
  seq: number;
}

export enum CommandType {
  PublishEvents = "PublishEvents",
  SendSignal = "SendSignal",
  StartActivity = "StartActivity",
  StartTimer = "StartTimer",
  StartWorkflow = "StartWorkflow",
}

/**
 * A command is an action taken to start or emit something.
 *
 * Current: Schedule Activity
 * Future: Emit Signal, Start Workflow, etc
 */
export interface ScheduleActivityCommand
  extends CommandBase<CommandType.StartActivity> {
  name: string;
  args: any[];
  heartbeatSeconds?: number;
}

export function isScheduleActivityCommand(
  a: Command
): a is ScheduleActivityCommand {
  return a.kind === CommandType.StartActivity;
}

// TODO support a timeout at the parent workflow level. The current timeout fails the whole workflow and not just the waiter.
export interface ScheduleWorkflowCommand
  extends CommandBase<CommandType.StartWorkflow> {
  name: string;
  input?: any;
  opts?: WorkflowOptions;
}

export function isScheduleWorkflowCommand(
  a: Command
): a is ScheduleWorkflowCommand {
  return a.kind === CommandType.StartWorkflow;
}

export interface StartTimerCommand extends CommandBase<CommandType.StartTimer> {
  /**
   * Minimum time (in ISO 8601) where the machine should wake up.
   */
  schedule: Schedule;
}

export function isStartTimerCommand(
  command: Command
): command is StartTimerCommand {
  return command.kind === CommandType.StartTimer;
}

export interface SendSignalCommand extends CommandBase<CommandType.SendSignal> {
  signalId: string;
  target: SignalTarget;
  payload?: any;
}

export function isSendSignalCommand(
  command: Command
): command is SendSignalCommand {
  return command.kind === CommandType.SendSignal;
}

export interface PublishEventsCommand
  extends CommandBase<CommandType.PublishEvents> {
  events: EventEnvelope[];
}

export function isPublishEventsCommand(
  command: Command
): command is PublishEventsCommand {
  return command.kind === CommandType.PublishEvents;
}
