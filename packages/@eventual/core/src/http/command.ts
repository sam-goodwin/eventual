import z from "zod";
import type { FunctionRuntimeProps } from "../function-props.js";
import type { HttpMethod } from "../http-method.js";
import { commands } from "../internal/global.js";
import { CommandSpec, isSourceLocation } from "../internal/service-spec.js";
import type { ServiceContext } from "../service.js";
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

export interface CommandContext {
  service: ServiceContext;
}

export type AnyCommand = Command<
  string,
  any,
  any,
  any,
  any,
  HttpMethod | undefined
>;

export interface Command<
  Name extends string = string,
  Input = undefined,
  Output = void,
  Context extends CommandContext = CommandContext,
  Path extends string | undefined = undefined,
  Method extends HttpMethod | undefined = undefined
> extends Omit<
    CommandSpec<Name, Input, Path, Method>,
    "input" | "outputs" | "output"
  > {
  kind: "Command";
  input?: z.ZodType<Input>;
  output?: CommandOutputOptions<Output>;
  /**
   * Other possible outputs of the command, for example, errors.
   */
  otherOutputs?: CommandOutputOptions<any>[];
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

export type CommandHandler<
  T = undefined,
  U = void,
  Context extends CommandContext = CommandContext
> = (input: T, context: Context) => Promise<U> | U;

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

export interface CommandOutputOptions<Output> {
  schema: z.ZodType<Output>;
  description: string;
  restStatusCode: number;
}

export type CommandOutput<Output> =
  | z.ZodType<Output>
  | CommandOutputOptions<Output>;

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
  /**
   * The output schema of the command.
   *
   * When a description of the output can is provided, it will be used the {@link ApiSpecification}.
   *
   * When a rest status is provided and the command supports a rest path, that status will be used to return a successful result.
   * Note: RPC commands will always return 200.
   *
   * @default 200 {@link z.any} OK
   */
  output?: CommandOutput<Output>;
}

export function command<
  Name extends string,
  Input = undefined,
  Output = void,
  Context extends CommandContext = CommandContext
>(
  name: Name,
  handler: CommandHandler<Input, Output, Context>
): Command<Name, Input, Output, Context, undefined, undefined>;

export function command<
  Name extends string,
  Input = undefined,
  Output = void,
  Context extends CommandContext = CommandContext,
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
  Context extends CommandContext = CommandContext
>(...args: any[]): Command<Name, Input, Output, Context, any, any> {
  const [sourceLocation, name, options, handler] = parseCommandArgs<
    Input,
    Output
  >(args);
  const command: Command<Name, Input, Output, Context, any, any> = {
    kind: "Command",
    name,
    handler,
    sourceLocation,
    ...options,
    output: options?.output
      ? options.output instanceof z.ZodType
        ? { schema: options.output, description: "OK", restStatusCode: 200 }
        : options.output
      : { schema: z.any(), description: "OK", restStatusCode: 200 },
  };
  commands.push(command);
  return command;
}

export function parseCommandArgs<
  Input = undefined,
  Output = void,
  Context extends CommandContext = CommandContext
>(args: any[]) {
  return [
    // TODO: is this 4x scan too inefficient, or is the trade-off between simplicity and performance worth it here?
    // i think it would be marginal looping over a small array multiple times but i could be wrong
    args.find(isSourceLocation),
    args.find((a) => typeof a === "string"),
    args.find((a) => typeof a === "object" && !isSourceLocation(a)) as
      | CommandOptions<Input, Output, any, any>
      | undefined,
    args.find((a) => typeof a === "function") as CommandHandler<
      Input,
      Output,
      Context
    >,
  ] as const;
}
