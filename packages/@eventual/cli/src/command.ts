import { Command } from "commander";

//Add a subcommand to a command, with a given name, and function to configure it
export function addCommand(
  cmd: Command,
  configure: (cmd: Command) => Command,
  name?: string
): Command {
  return cmd.addCommand(configure(new Command(name)));
}

//Add a list of subCommands to the given command
export function addCommands(
  cmd: Command,
  commands: Record<string, (cmd: Command) => Command>
): Command {
  Object.entries(commands).forEach(([name, configure]) =>
    addCommand(cmd, configure, name)
  );
  return cmd;
}
