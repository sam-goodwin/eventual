/**
 * This script imports a user's script and outputs a JSON object
 * to stdout containing all of the data that can be inferred.
 *
 * @see ServiceSpec
 */
import { generateSchema } from "@anatine/zod-openapi";
import {
  BucketNotificationHandlerSpec,
  CommandSpec,
  ServiceSpec,
  buckets,
  commands,
  entities,
  events,
  searchIndices,
  subscriptions,
  tasks,
  transactions,
  workflows,
} from "@eventual/core/internal";
import {
  CallExpression,
  ExportDeclaration,
  Expression,
  ModuleDeclaration,
  TsType,
  parseFile,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import crypto from "crypto";
import esbuild from "esbuild";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getSpan,
  isBucketHandlerMemberCall,
  isCommandCall,
  isEntityStreamMemberCall,
  isOnEventCall,
  isSubscriptionCall,
  isTaskCall,
} from "./ast-util.js";
import { printModule } from "./print-module.js";

export async function infer(
  scriptName = process.argv[2],
  openApi: ServiceSpec["openApi"]
): Promise<ServiceSpec> {
  if (scriptName === undefined) {
    throw new Error(`scriptName undefined`);
  }

  const tmp = os.tmpdir();

  const bundle = await esbuild.build({
    mainFields: ["module", "main"],
    entryPoints: [scriptName],
    plugins: [inferPlugin],
    sourcemap: false,
    bundle: true,
    write: false,
    platform: "node",
  });

  const script = bundle.outputFiles[0]!.text;
  const hash = crypto.createHash("md5").update(script).digest("hex");
  scriptName = path.join(tmp, `${hash}.js`);
  await fs.writeFile(scriptName, script);

  await import(path.resolve(scriptName));

  const serviceSpec: ServiceSpec = inferFromMemory(openApi);

  console.log(JSON.stringify(serviceSpec));

  return serviceSpec;
}

export function inferFromMemory(openApi: ServiceSpec["openApi"]): ServiceSpec {
  return {
    workflows: [...workflows().keys()].map((n) => ({ name: n })),
    tasks: Object.values(tasks()).map((task) => ({
      name: task.name,
      sourceLocation: task.sourceLocation,
      options: task.options,
    })),
    events: Array.from(events().values()).map((event) => ({
      name: event.name,
      schema: event.schema ? generateSchema(event.schema) : undefined,
    })),
    subscriptions: subscriptions().map((e) => ({
      name: e.name,
      props: {
        memorySize: e.props?.memorySize,
        retryAttempts: e.props?.retryAttempts,
        handlerTimeout: e.props?.handlerTimeout,
      },
      sourceLocation: e.sourceLocation,
      filters: e.filters,
    })),
    commands: commands.map(
      (command) =>
        ({
          name: command.name,
          sourceLocation: command.sourceLocation,
          path: command.path,
          description: command.description,
          summary: command.summary,
          memorySize: command.memorySize,
          handlerTimeout: command.handlerTimeout,
          method: command.method as any,
          input: command.input ? generateSchema(command.input) : undefined,
          output: command.output
            ? {
                restStatusCode: command.output.restStatusCode,
                description: command.output.description,
                schema: command.output.schema
                  ? generateSchema(command.output.schema)
                  : { nullable: true },
              }
            : undefined,
          outputs: command.otherOutputs?.map((o) => ({
            restStatusCode: o.restStatusCode,
            description: o.description,
            schema: o.schema ? generateSchema(o.schema) : undefined,
          })),
          passThrough: command.passThrough,
          params: command.params as any,
          validate: command.validate,
          namespace: command.namespace,
        } satisfies CommandSpec)
    ),
    buckets: {
      buckets: [...buckets().values()].map((b) => ({
        name: b.name,
        handlers: b.handlers.map(
          (s) =>
            ({
              name: s.name,
              bucketName: s.bucketName,
              options: s.options,
              sourceLocation: s.sourceLocation,
            } satisfies BucketNotificationHandlerSpec)
        ),
      })),
    },
    entities: {
      entities: [...entities().values()].map((d) => ({
        key: d.key,
        name: d.name,
        streams: d.streams,
        indices: d.indices,
        attributes: generateSchema(d.attributes),
      })),
    },
    transactions: [...transactions().values()].map((t) => ({
      name: t.name,
    })),
    openApi,
    search: {
      indices: Array.from(searchIndices().values()).map((i) => ({
        index: i.indexName,
        aliases: i.options.aliases,
        mappings: i.options.mappings,
        settings: i.options.settings ?? {},
      })),
    },
  };
}

export const inferPlugin: esbuild.Plugin = {
  name: "eventual",
  setup(build) {
    build.onLoad({ filter: /\.[mc]?[tj]s$/g }, async (args) => {
      // FYI: SWC erases comments: https://github.com/swc-project/swc/issues/6403
      const sourceModule = await parseFile(args.path, {
        syntax: "typescript",
      });

      const inferVisitor = new InferVisitor(args.path);
      const transformedModule = inferVisitor.visitModule(sourceModule);

      if (inferVisitor.didMutate) {
        const { code } = await printModule(transformedModule, args.path);

        return {
          contents: code,
          loader: "js",
        };
      }
      return undefined;
    });
  },
};

export class InferVisitor extends Visitor {
  public didMutate = false;

  private exportName: string | undefined;

  constructor(readonly fileName: string) {
    super();
  }

  public visitTsType(n: TsType): TsType {
    return n;
  }

  public visitExportDeclaration(decl: ExportDeclaration): ModuleDeclaration {
    if (decl.declaration.type === "VariableDeclaration") {
      if (
        !decl.declaration.declare &&
        decl.declaration.declarations.length === 1
      ) {
        const varDecl = decl.declaration.declarations[0]!;
        if (varDecl.id.type === "Identifier") {
          if (varDecl.init?.type === "CallExpression") {
            this.exportName = varDecl.id.value;

            const call = this.visitCallExpression(varDecl.init);

            this.exportName = undefined;

            return {
              ...decl,
              declaration: {
                ...decl.declaration,
                declarations: [
                  {
                    ...varDecl,
                    init: call,
                  },
                ],
              },
            };
          }
        }
      }
    }
    return super.visitExportDeclaration(decl);
  }

  public visitCallExpression(call: CallExpression): Expression {
    if (
      this.exportName &&
      [
        isCommandCall,
        isOnEventCall,
        isSubscriptionCall,
        isTaskCall,
        isEntityStreamMemberCall,
        isBucketHandlerMemberCall,
      ].some((op) => op(call))
    ) {
      this.didMutate = true;

      return {
        ...call,
        arguments: [
          {
            expression: {
              type: "ObjectExpression",
              span: getSpan(call),
              properties: [
                {
                  type: "KeyValueProperty",
                  key: {
                    type: "Identifier",
                    optional: false,
                    span: getSpan(call),
                    value: "exportName",
                  },
                  value: {
                    type: "StringLiteral",
                    span: getSpan(call),
                    value: this.exportName,
                  },
                },
                {
                  type: "KeyValueProperty",
                  key: {
                    type: "Identifier",
                    optional: false,
                    span: getSpan(call),
                    value: "fileName",
                  },
                  value: {
                    type: "StringLiteral",
                    span: {
                      ctxt: 0,
                      end: 0,
                      start: 0,
                    },
                    value: this.fileName,
                  },
                },
              ],
            },
          },
          ...call.arguments,
        ],
      };
    }
    return super.visitCallExpression(call);
  }
}
