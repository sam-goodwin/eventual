import type z from "zod";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import { commands } from "../internal/global.js";
import { CommandSpec, isSourceLocation } from "../internal/service-spec.js";
import type { Middleware } from "./middleware.js";
import type { ParsePath } from "./path.js";

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

export type AnyCommand = Command<string, any, any, any, any, any>;

export interface Command<
  Name extends string = string,
  Input = undefined,
  Output = void,
  Context = any,
  Path extends string | undefined = undefined,
  Method extends HttpMethod | undefined = undefined
> extends Omit<CommandSpec<Name, Input, Path, Method>, "input" | "output"> {
  kind: "Command";
  input?: z.ZodType<Input>;
  output?: z.ZodType<Awaited<Output>>;
  handler: CommandHandler<Input, Output, Context>;
  middlewares?: Middleware<any, any>[];
}

export type RestOptions<
  Input,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
> = {
  path?: Path;
  method?: Method;
  params?: RestParams<Input, Path, Method>;
};

export type RestParamSpec =
  | "body"
  | "path"
  | "query"
  | "header"
  | {
      in: "query" | "header" | "body";
      name?: string;
    };

export type RestParams<
  Input,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
> = {
  [k in keyof Input]?: k extends ParsePath<Exclude<Path, undefined>>
    ? "path"
    : Method extends "GET"
    ? RestParam<"query" | "header">
    : RestParam<"query" | "header" | "body">;
};

export type RestParam<In extends "query" | "body" | "header"> =
  | In
  | {
      in: In;
      name?: string;
    };

export interface Headers {
  [headerName: string]: string;
}

export type CommandHandler<T = undefined, U = void, Context = any> = (
  input: T,
  context: Context
) => Promise<U> | Awaited<U>;

export type CommandInput<C extends AnyCommand> = C extends Command<
  any,
  infer Input,
  any,
  any,
  any,
  any
>
  ? Input
  : never;

export interface CommandOptions<
  Input,
  Output,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
> extends FunctionRuntimeProps {
  path?: Path;
  method?: Method;
  params?: RestParams<Input, Path, Method>;
  input?: z.ZodType<Input>;
  output?: z.ZodType<Output>;
  /**
   * Enable or disable schema validation.
   *
   * @default true
   */
  validate?: boolean;
}

export function command<
  Name extends string,
  Input = undefined,
  Output = void,
  Context = any
>(
  name: Name,
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, undefined, undefined>;

export function command<
  Name extends string,
  Input = undefined,
  Output = void,
  Context = any,
  Path extends string | undefined = undefined,
  Method extends HttpMethod | undefined = undefined
>(
  name: Name,
  options: CommandOptions<Input, Output, Path, Method>,
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, Path, Method>;

export function command<
  Name extends string,
  Input = undefined,
  Output = void,
  Context = any
>(...args: any[]): Command<Name, Input, Output, Context, any, any> {
  const [sourceLocation, name, options, handler] = parseCommandArgs(args);
  const command: Command<Name, Input, Output, Context, any, any> = {
    kind: "Command",
    name,
    handler,
    sourceLocation,
    ...options,
  };
  commands.push(command);
  return command;
}

export function parseCommandArgs(args: any[]) {
  return [
    // TODO: is this 4x scan too inefficient, or is the trade-off between simplicity and performance worth it here?
    // i think it would be marginal looping over a small array multiple times but i could be wrong
    args.find(isSourceLocation),
    args.find((a) => typeof a === "string"),
    args.find((a) => typeof a === "object" && !isSourceLocation(a)),
    args.find((a) => typeof a === "function"),
  ] as const;
}
