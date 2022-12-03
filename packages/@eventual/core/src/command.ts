import { SignalTarget } from "./signals.js";

export type Command =
  | SleepUntilCommand
  | SleepForCommand
  | ScheduleActivityCommand
  | ScheduleWorkflowCommand
  | WaitForSignalCommand
  | SendSignalCommand
  | StartConditionCommand;

interface CommandBase<T extends CommandType> {
  kind: T;
  seq: number;
}

export enum CommandType {
  StartActivity = "StartActivity",
  SleepUntil = "SleepUntil",
  SleepFor = "SleepFor",
  StartWorkflow = "StartWorkflow",
  WaitForSignal = "WaitForSignal",
  SendSignal = "SendSignal",
  StartCondition = "StartCondition",
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
}

export function isScheduleActivityCommand(
  a: Command
): a is ScheduleActivityCommand {
  return a.kind === CommandType.StartActivity;
}

export interface ScheduleWorkflowCommand
  extends CommandBase<CommandType.StartWorkflow> {
  name: string;
  input?: any;
}

export function isScheduleWorkflowCommand(
  a: Command
): a is ScheduleWorkflowCommand {
  return a.kind === CommandType.StartWorkflow;
}

export interface SleepUntilCommand extends CommandBase<CommandType.SleepUntil> {
  /**
   * Minimum time (in ISO 8601) where the machine should wake up.
   */
  untilTime: string;
}

export function isSleepUntilCommand(
  command: Command
): command is SleepUntilCommand {
  return command.kind === CommandType.SleepUntil;
}

export interface SleepForCommand extends CommandBase<CommandType.SleepFor> {
  /**
   * Number of seconds from the time the command is executed until the machine should wake up.
   */
  durationSeconds: number;
}

export function isSleepForCommand(
  command: Command
): command is SleepForCommand {
  return command.kind === CommandType.SleepFor;
}

export interface WaitForSignalCommand
  extends CommandBase<CommandType.WaitForSignal> {
  signalId: string;
  timeoutSeconds?: number;
}

export function isWaitForSignalCommand(
  command: Command
): command is WaitForSignalCommand {
  return command.kind === CommandType.WaitForSignal;
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

export interface StartConditionCommand
  extends CommandBase<CommandType.StartCondition> {
  timeoutSeconds?: number;
}

export function isStartConditionCommand(
  command: Command
): command is StartConditionCommand {
  return command.kind === CommandType.StartCondition;
}
