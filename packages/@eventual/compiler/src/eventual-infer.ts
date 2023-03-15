/**
 * This script imports a user's script and outputs a JSON object
 * to stdout containing all of the data that can be inferred.
 *
 * @see ServiceSpec
 */
import { generateSchema } from "@anatine/zod-openapi";
import {
  activities,
  commands,
  events,
  ServiceSpec,
  subscriptions,
  workflows,
} from "@eventual/core/internal";
import {
  CallExpression,
  ExportDeclaration,
  Expression,
  ModuleDeclaration,
  parseFile,
  TsType,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import esbuild from "esbuild";
import {
  getSpan,
  isActivityCall,
  isCommandCall,
  isOnEventCall,
  isSubscriptionCall,
} from "./ast-util.js";
import { loadService } from "./build.js";
import { printModule } from "./print-module.js";

export async function infer(scriptName: string): Promise<ServiceSpec> {
  await loadServiceForInfer(scriptName);

  const serviceSpec = inferLoadedService();

  console.log(JSON.stringify(serviceSpec));

  return serviceSpec;
}

/**
 * Uses global service data after loading using {@link loadService} or {@link loadServiceForInfer}.
 *
 * To get source locations, use {@link loadServiceForInfer}.
 */
export function inferLoadedService(): ServiceSpec {
  return {
    workflows: [...workflows().keys()].map((n) => ({ name: n })),
    activities: Object.values(activities()).map((activity) => ({
      name: activity.name,
      sourceLocation: activity.sourceLocation,
      options: activity.options,
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
    commands: commands.map((command) => ({
      name: command.name,
      sourceLocation: command.sourceLocation,
      path: command.path,
      memorySize: command.memorySize,
      handlerTimeout: command.handlerTimeout,
      method: command.method,
      input: command.input ? generateSchema(command.input) : undefined,
      output: command.output ? generateSchema(command.output) : undefined,
      passThrough: command.passThrough,
      params: command.params,
      validate: command.validate,
      namespace: command.namespace,
    })),
  };
}

export async function loadServiceForInfer(entry: string) {
  return loadService(entry, [inferPlugin], false);
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
  public didMutate: boolean = false;

  private exportName: string | undefined;

  constructor(readonly fileName: string) {
    super();
  }

  public visitTsType(n: TsType): TsType {
    return n;
  }

  visitExportDeclaration(decl: ExportDeclaration): ModuleDeclaration {
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

  visitCallExpression(call: CallExpression): Expression {
    if (
      this.exportName &&
      (isCommandCall(call) ||
        isOnEventCall(call) ||
        isSubscriptionCall(call) ||
        isActivityCall(call))
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
