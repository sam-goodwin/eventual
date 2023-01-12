import { DurationUnit } from "./await-time.js";
import { EventEnvelope } from "./event.js";
import { SignalTarget } from "./signals.js";
import { WorkflowOptions } from "./workflow.js";

export type Command =
  | AwaitDurationCommand
  | AwaitTimeCommand
  | ScheduleActivityCommand
  | ScheduleWorkflowCommand
  | PublishEventsCommand
  | SendSignalCommand;

interface CommandBase<T extends CommandType> {
  kind: T;
  seq: number;
}

export enum CommandType {
  AwaitDuration = "AwaitDuration",
  AwaitTime = "AwaitTime",
  PublishEvents = "PublishEvents",
  SendSignal = "SendSignal",
  StartActivity = "StartActivity",
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

export interface AwaitTimeCommand extends CommandBase<CommandType.AwaitTime> {
  /**
   * Minimum time (in ISO 8601) where the machine should wake up.
   */
  untilTime: string;
}

export function isAwaitTimeCommand(
  command: Command
): command is AwaitTimeCommand {
  return command.kind === CommandType.AwaitTime;
}

export interface AwaitDurationCommand
  extends CommandBase<CommandType.AwaitDuration> {
  /**
   * Number of seconds from the time the command is executed until the machine should wake up.
   */
  dur: number;
  unit: DurationUnit;
}

export function isAwaitDurationCommand(
  command: Command
): command is AwaitDurationCommand {
  return command.kind === CommandType.AwaitDuration;
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
