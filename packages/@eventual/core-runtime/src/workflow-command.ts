import { EventEnvelope } from "../../core/src/event.js";
import { DurationSchedule, Schedule } from "../../core/src/schedule.js";
import { WorkflowExecutionOptions } from "../../core/src/workflow.js";
import { SignalTarget } from "../../core/src/internal/signal.js";

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
  input: any;
  heartbeat?: DurationSchedule;
}

export function isScheduleActivityCommand(
  a: WorkflowCommand
): a is ScheduleActivityCommand {
  return a.kind === CommandType.StartActivity;
}

export interface ScheduleWorkflowCommand
  extends CommandBase<CommandType.StartWorkflow> {
  name: string;
  input?: any;
  opts?: WorkflowExecutionOptions;
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
