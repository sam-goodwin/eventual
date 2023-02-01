/**
 * This script imports a user's script and outputs a JSON object
 * to stdout containing all of the data that can be inferred.
 *
 * @see ServiceSpec
 */
import {
  eventSubscriptions,
  routes,
  RouteSpec,
  ServiceSpec,
  workflows,
} from "@eventual/core";
import {
  CallExpression,
  ExportDeclaration,
  Expression,
  ModuleDeclaration,
  parseFile,
  TsType,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import crypto from "crypto";
import esbuild from "esbuild";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { getSpan, isApiCall } from "./ast-util.js";
import { printModule } from "./print-module.js";

export async function infer(
  scriptName = process.argv[2]
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

  const serviceSpec: ServiceSpec = {
    subscriptions: eventSubscriptions().flatMap((e) => e.subscriptions),
    api: {
      routes: routes.map(
        (route) =>
          ({
            sourceLocation: route.sourceLocation,
            path: route.path,
            memorySize: route.runtimeProps?.memorySize,
            timeout: route.runtimeProps?.timeout,
            method: route.method,
          } satisfies RouteSpec)
      ),
    },
    workflows: [...workflows().keys()].map((n) => ({ name: n })),
  };

  console.log(JSON.stringify(serviceSpec));

  return serviceSpec;
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
    if (this.exportName && isApiCall(call)) {
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
