import type { AnyCommand } from "./command.js";

export function isDefaultNamespaceCommand<
  C extends Pick<AnyCommand, "name" | "namespace">
>(command: C): command is C & { namespace: undefined } {
  return !command.namespace;
}

/**
 * Formats the RPC Rest path for a command.
 *
 * rpc[/namespace]/name
 */
export function commandRpcPath(
  command: Pick<AnyCommand, "name" | "namespace">
) {
  return `rpc${
    isDefaultNamespaceCommand(command) ? "" : `/${command.namespace}`
  }${command.name.startsWith("/") ? "" : "/"}${command.name}`;
}
