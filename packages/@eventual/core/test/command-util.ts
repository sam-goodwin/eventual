import { CommandType, StartActivityCommand } from "../src/command";
import { createActivityCall } from "../src/activity-call";

export function createStartActivityCommand(
  name: string,
  args: any[],
  seq: number
): StartActivityCommand {
  return {
    type: CommandType.StartActivity,
    ...createActivityCall(name, args),
    seq,
  };
}
