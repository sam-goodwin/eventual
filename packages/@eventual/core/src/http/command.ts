import type z from "zod";
import { SourceLocation } from "../service-spec.js";
import type { FunctionRuntimeProps } from "../function-props.js";
import { commands } from "../global.js";
import type { HttpMethod } from "../http-method.js";
import type { ParsePath } from "./path.js";

export interface Command<
  Name extends string = string,
  Handler extends CommandHandler = CommandHandler,
  Path extends string | undefined = string | undefined,
  Method extends HttpMethod | undefined = HttpMethod | undefined
> extends FunctionRuntimeProps {
  kind: "Command";
  name: Name;
  input?: z.ZodType<Parameters<Handler>[0]>;
  output?: z.ZodType<Awaited<ReturnType<Handler>>[0]>;
  handler: Handler;
  path?: Path;
  method?: Method;
  params?: RestParams<Parameters<Handler>[0], Path, Method>;
  sourceLocation?: SourceLocation;
  passThrough?: boolean;
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

export interface CommandMetadata {
  headers?: Headers;
}

export type CommandHandler<T = any, U = any> = (
  input: T,
  metadata: CommandMetadata
) => Promise<U> | Awaited<U>;

export function command<Name extends string, Handler extends CommandHandler>(
  name: Name,
  handler: Handler
): Command<Name, Handler, undefined, undefined>;

export function command<
  Name extends string,
  Input,
  Output,
  Path extends string | undefined,
  Method extends HttpMethod | undefined,
  Handler extends CommandHandler<Input, Output>
>(
  name: Name,
  options: FunctionRuntimeProps & {
    path?: Path;
    method?: Method;
    params?: RestParams<Input, Path, Method>;
    input: z.ZodType<Input>;
    output?: z.ZodType<Output>;
  },
  handler: Handler
): Command<Name, Handler, Path, Method>;

export function command<
  Name extends string,
  Path extends string | undefined,
  Method extends HttpMethod | undefined,
  Handler extends CommandHandler
>(
  name: Name,
  options: FunctionRuntimeProps & {
    path?: Path;
    method?: Method;
    params?: RestParams<Parameters<Handler>[0], Path, Method>;
    input?: undefined;
  },
  handler: Handler
): Command<Name, Handler, Path, Method>;

export function command<Name extends string, Handler extends CommandHandler>(
  name: Name,
  ...args: any[]
): Command<Name, Handler, undefined, undefined> {
  const [options, handler] =
    args.length === 1 ? [undefined, args[0]] : [args[0], args[1]];
  const command: Command<Name, Handler, undefined, undefined> = {
    kind: "Command",
    name,
    handler,
    ...options,
  };
  commands.push(command);
  return command;
}
