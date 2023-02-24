import { EventEnvelope } from "../event.js";
import { DurationSchedule, Schedule } from "../schedule.js";
import { SignalTarget } from "./signal.js";
import { WorkflowOptions } from "../workflow.js";
import { CommandSpec } from "./service-spec.js";

export const EVENTUAL_INTERNAL_COMMAND_NAMESPACE = "_internal";
export const EVENTUAL_DEFAULT_COMMAND_NAMESPACE = "_default";
export function isInternalCommand(command: CommandSpec) {
  return command.namespace === EVENTUAL_INTERNAL_COMMAND_NAMESPACE;
}

export type WorkflowCommand =
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
  heartbeat?: DurationSchedule;
}

export function isScheduleActivityCommand(
  a: WorkflowCommand
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
  a: WorkflowCommand
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
  command: WorkflowCommand
): command is StartTimerCommand {
  return command.kind === CommandType.StartTimer;
}

export interface SendSignalCommand extends CommandBase<CommandType.SendSignal> {
  signalId: string;
  target: SignalTarget;
  payload?: any;
}

export function isSendSignalCommand(
  command: WorkflowCommand
): command is SendSignalCommand {
  return command.kind === CommandType.SendSignal;
}

export interface PublishEventsCommand
  extends CommandBase<CommandType.PublishEvents> {
  events: EventEnvelope[];
}

export function isPublishEventsCommand(
  command: WorkflowCommand
): command is PublishEventsCommand {
  return command.kind === CommandType.PublishEvents;
}
