import type openapi from "openapi3-ts";
import { commandRpcPath } from "../http/command.js";
import type { CommandSpec } from "./service-spec.js";

export interface OpenAPISpecOptions {
  /**
   * When true, creates RPC paths in the form POST /rpc/commandName for each command.
   *
   * @default true
   */
  createRpcPaths?: boolean;
  /**
   * When true, creates a Rest path in the form `${command.method} ${command.path}` for each command that has a path defined.
   *
   * @default true
   */
  createRestPaths?: boolean;
  info: openapi.InfoObject;
  servers?: openapi.ServerObject[];
  onRpcPath?: (
    command: CommandSpec,
    pathItem: openapi.OperationObject
  ) => openapi.PathObject;
  onRestPath?: (
    command: CommandSpec,
    pathItem: openapi.OperationObject
  ) => openapi.PathObject;
}

export function generateOpenAPISpec(
  commands: CommandSpec<any, any, any, any>[],
  options: OpenAPISpecOptions
): openapi.OpenAPIObject {
  const paths = commands
    .map((command) => {
      return createAPIPaths(command);
    })
    .reduce<openapi.PathsObject>(
      (allPaths, paths) => mergeAPIPaths(allPaths, paths),
      {}
    );

  return {
    openapi: "3.0.1",
    info: options.info,
    servers: options.servers,
    paths,
  } satisfies openapi.OpenAPIObject;

  function mergeAPIPaths(
    a: openapi.PathsObject,
    b: openapi.PathsObject
  ): openapi.PathsObject {
    for (const [path, route] of Object.entries(b)) {
      if (path in a) {
        // spread collisions into one
        // assumes no duplicate METHODs
        a[path] = {
          ...a[path],
          ...route,
        };
      } else {
        a[path] = route;
      }
    }
    return a;
  }

  function createAPIPaths(
    command: CommandSpec<any, any, any, any>
  ): openapi.PathsObject {
    const commandPath = commandRpcPath(command);

    return {
      ...(options.createRpcPaths ?? true ? createRpcOperation() : {}),
      ...(options.createRestPaths ?? true ? createRestOperation() : {}),
    };

    function createRpcOperation(): openapi.PathItemObject {
      const obj = {
        post: {
          operationId: `${command.name}-rpc`,
          description: command.description,
          summary: command.summary,
          requestBody: {
            content: {
              "application/json": {
                schema: command.input,
              },
            },
          },
          responses: {
            default: {
              content: { "application/json": { schema: command.output } },
              description: `Default response for POST ${commandPath}`,
            } satisfies openapi.ResponseObject,
          },
        } satisfies openapi.OperationObject,
      };

      return {
        [`/${commandPath}`]: options?.onRpcPath
          ? { post: options.onRpcPath(command, obj.post) }
          : obj,
      };
    }

    function createRestOperation(): openapi.PathItemObject {
      if (!command.path) {
        return {};
      }

      const pathParameters = new Set(parameterNamesFromPath(command.path));

      const knownProperties = new Set([
        ...Object.keys(command.params ?? {}),
        ...Object.keys(command.input?.properties ?? {}),
        ...pathParameters,
      ]);

      // default to query when the method should not have a body
      const defaultSpec =
        !command.method ||
        ["GET", "DELETE", "OPTIONS", "HEAD"].includes(command.method)
          ? "query"
          : "body";

      /**
       * 1. resolves the schema name for the parameter which may be different from the name in the input schema
       * 2. resolves the spec/in type based on the source of the parameter name, current method, and explicit input
       * 3. resolve the schema from the input schema to use in the output schema
       */
      const resolvedParameters = Object.fromEntries(
        [...knownProperties].map((prop) => {
          const param = command.params?.[prop];
          const [name, spec] =
            typeof param === "string"
              ? [prop, param]
              : [param?.name ?? prop, param?.in];
          return [
            name,
            {
              // if there is no explicit override and the param is in the path, the spec is path, else the computed default
              spec: spec ?? (pathParameters.has(name) ? "path" : defaultSpec),
              schema: command.input?.properties?.[prop],
            },
          ] as const;
        })
      );

      const bodyProperties = Object.fromEntries(
        Object.entries(resolvedParameters)
          .filter(([, { spec, schema }]) => spec === "body" && !!schema)
          .map(([name, { schema }]) => [name, schema!])
      );

      const bodySchema: openapi.SchemaObject | undefined =
        command.input?.properties && Object.keys(bodyProperties).length > 0
          ? {
              ...command.input,
              properties: bodyProperties,
              required: command.input.required?.filter(
                (p) => p in bodyProperties
              ),
            }
          : undefined;

      const operationItem: openapi.OperationObject = {
        operationId: `${command.name}-${command.method ?? "get"}`,
        description: command.description,
        summary: command.summary,
        parameters: Object.entries(resolvedParameters).flatMap(
          ([name, { spec, schema }]) =>
            spec === "body"
              ? []
              : [
                  {
                    in: spec,
                    name,
                    schema,
                  } satisfies openapi.ParameterObject,
                ]
        ),
        requestBody: {
          content: {
            ...(bodySchema
              ? {
                  "application/json": {
                    schema: bodySchema,
                  },
                }
              : {}),
          },
        },
        responses: {
          default: {
            description: `Default response for ${command.method} ${command.path}`,
            content: {
              "application/json": { schema: command.output },
            },
          },
        },
      };

      return {
        [ittyRouteToOpenApiRoute(command.path)]: {
          [command.method?.toLocaleLowerCase() ?? "get"]: options?.onRestPath
            ? options.onRestPath(command, operationItem)
            : operationItem,
        },
      };
    }
  }
}

function parameterNamesFromPath(path: string): string[] {
  return Array.from(path.matchAll(/\/:([^/?#]*)/g))
    .map(([, g]) => g)
    .filter((x): x is string => !!x);
}

// Note: open api doesn't have a formal way to represent greedy parameters.
// Using API Gateway's format of {param+}.
function ittyRouteToOpenApiRoute(route: string) {
  return route === "*"
    ? "/{proxy+}"
    : route.replace(/\*/g, "{proxy+}").replaceAll(/:([^/]*)/g, "{$1}");
}
