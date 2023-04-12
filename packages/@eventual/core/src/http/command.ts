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

export type AnyCommand = Command<string, any, any, any, any, HttpMethod | undefined>;

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
  /**
   * Maps parameters from different sources to a single input object.
   *
   * ```ts
   * // POST /properties/:userId?expectedVersion=1
   * // { age: 35 }
   * command("/properties/:userId", {
   *    params: {
   *       expectedVersion: "query",
   *       contentType: { in: "headers", name: "content-type" },
   *    },
   *    input: z.object({
   *       userId: z.string(),
   *       expectedVersion: z.number().optional(),
   *       contentType: z.string(),
   *       age: z.number()
   *    }),
   * }, ({userId}) => { console.log(userId); });
   * ```
   *
   * userId - assumed to come from the path
   * expectedVersion - explicitly mapped from the query string
   * contentType - explicitly mapped from the headers and renamed
   * age - assumed to come from the body
   *
   * Default location:
   *    GET/DELETE/HEAD/OPTIONS - query
   *    POST/PUT/PATCH - body
   */
  params?: RestParams<Input, Path, Method>;
};

export type RestParams<
  Input,
  Path extends string | undefined,
  Method extends HttpMethod | undefined
> = {
  [k in keyof Partial<Input>]: k extends ParsePath<Exclude<Path, undefined>>
    ? "path"
    : Method extends "GET" | "DELETE" | "HEAD" | "OPTIONS"
    ? RestParam<"query" | "header" | "path">
    : RestParam;
};

export type RestParamLocation = "query" | "body" | "header" | "path";

export type RestParam<In extends RestParamLocation = RestParamLocation> =
  | In
  | {
      in: Exclude<In, "path">;
      /**
       * The name of the parameter in the source location.
       *
       * For example, if the query string parameter is `UserID`, but the input schema uses `userId`.
       *
       * ```ts
       * // /properties?UserID=...
       * command("/properties", {
       *    params: {
       *       userId: {
       *          in: "query",
       *          name: "UserID"
       *       },
       *    },
       *    input: z.object({
       *       userId: z.string().optional()
       *    }),
       * }, ({userId}) => { console.log(userId); });
       * ```
       */
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
> extends FunctionRuntimeProps,
    Pick<
      CommandSpec<string, Input, Path, Method>,
      "path" | "method" | "summary" | "description" | "params" | "validate"
    > {
  input?: z.ZodType<Input>;
  output?: z.ZodType<Output>;
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
