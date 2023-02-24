import type z from "zod";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import { commands } from "../internal/global.js";
import { isSourceLocation, SourceLocation } from "../internal/service-spec.js";
import type { ParsePath } from "./path.js";
import type { Middleware } from "./middleware.js";

export interface Command<
  Name extends string = string,
  Input = any,
  Output = any,
  Context = any,
  Path extends string | undefined = string | undefined,
  Method extends HttpMethod | undefined = HttpMethod | undefined
> extends FunctionRuntimeProps {
  kind: "Command";
  name: Name;
  input?: z.ZodType<Input>;
  output?: z.ZodType<Awaited<Output>>;
  handler: CommandHandler<Input, Output, Context>;
  path?: Path;
  method?: Method;
  params?: RestParams<Input, Path, Method>;
  sourceLocation?: SourceLocation;
  passThrough?: boolean;
  /**
   * @default _default
   */
  namespace?: string;
  middlewares?: Middleware<any, any>[];
  /**
   * @default true
   */
  validate?: boolean;
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

export type CommandHandler<T = any, U = any, Context = any> = (
  input: T,
  context: Context
) => Promise<U> | Awaited<U>;

export type CommandInput<C extends Command> = C extends Command<
  any,
  infer Input
>
  ? Input
  : never;

export type CommandOutput<C extends Command> = C extends Command<
  any,
  any,
  infer Output
>
  ? Output
  : never;

export function command<Name extends string, Input, Output, Context>(
  name: Name,
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, undefined, undefined>;

export function command<
  Name extends string,
  Input,
  Output,
  Context,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
>(
  name: Name,
  options: FunctionRuntimeProps & {
    path?: Path;
    method?: Method;
    params?: RestParams<Input, Path, Method>;
    input: z.ZodType<Input>;
    output?: z.ZodType<Output>;
    /**
     * Enable or disable schema validation.
     *
     * @default true
     */
    validate?: boolean;
  },
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, Path, Method>;

export function command<
  Name extends string,
  Input,
  Output,
  Context,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
>(
  name: Name,
  options: FunctionRuntimeProps & {
    path?: Path;
    method?: Method;
    params?: RestParams<Input, Path, Method>;
    input?: undefined;
    /**
     * Enable or disable schema validation.
     *
     * @default true
     */
    validate?: boolean;
  },
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, Path, Method>;

export function command<Name extends string, Input, Output, Context>(
  ...args: any[]
): Command<Name, Input, Output, Context, undefined, undefined> {
  const [sourceLocation, name, options, handler] = parseCommandArgs(args);
  const command: Command<Name, Input, Output, Context, undefined, undefined> = {
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
