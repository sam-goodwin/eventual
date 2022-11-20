export type Command =
  | SleepUntilCommand
  | SleepForCommand
  | StartActivityCommand;

interface CommandBase<T extends CommandType> {
  type: T;
  seq: number;
}

export enum CommandType {
  StartActivity = "StartActivity",
  SleepUntil = "SleepUntil",
  SleepFor = "SleepFor",
}

/**
 * A command is an action taken to start or emit something.
 *
 * Current: Schedule Activity
 * Future: Emit Signal, Start Workflow, etc
 */
export interface StartActivityCommand
  extends CommandBase<CommandType.StartActivity> {
  name: string;
  args: any[];
}

export function isStartActivityCommand(
  command: Command
): command is StartActivityCommand {
  return command.type === CommandType.StartActivity;
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
  return command.type === CommandType.SleepUntil;
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
  return command.type === CommandType.SleepFor;
}
