export type Command = SleepUntilCommand | StartActivityCommand;

interface CommandBase {
  type: CommandType;
  seq: number;
}

export enum CommandType {
  StartActivity = "StartActivity",
  SleepUntil = "SleepUntil",
}

/**
 * A command is an action taken to start or emit something.
 *
 * Current: Schedule Activity
 * Future: Emit Signal, Start Workflow, etc
 */
export interface StartActivityCommand extends CommandBase {
  type: CommandType.StartActivity;
  name: string;
  args: any[];
}

export function isStartActivityCommand(
  command: Command
): command is StartActivityCommand {
  return command.type === CommandType.StartActivity;
}

export interface SleepUntilCommand extends CommandBase {
  type: CommandType.SleepUntil;
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
