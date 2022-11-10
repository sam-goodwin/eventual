import esBuild from "esbuild";
import swc from "@swc/core";
import path from "path";
import { transformModuleWithVisitor } from "./visitor";

export const esBuildPlugin: esBuild.Plugin = {
  name: "Eventual",
  setup(build) {
    build.onLoad({ filter: /\.ts/g }, async (args) => {
      const sourceModule = await swc.parseFile(args.path, {
        syntax: "typescript",
      });

      let inEventualFunction = false;

      function enterEventual<T>(scope: () => T): T {
        let prevInEventualFunction = inEventualFunction;
        inEventualFunction = true;
        const result = scope();
        inEventualFunction = prevInEventualFunction;
        return result;
      }

      const supportedPromiseFunctions: (keyof PromiseConstructor)[] = [
        "all",
        "allSettled",
        "any",
        "race",
      ];

      const transformedModule = transformModuleWithVisitor(sourceModule, {
        visitAwaitExpression(awaitExpr) {
          if (inEventualFunction) {
            return {
              type: "YieldExpression",
              delegate: false,
              span: awaitExpr.span,
              argument: awaitExpr.argument,
            };
          }
          return awaitExpr;
        },
        visitCallExpression(call) {
          if (
            ((call.callee.type === "Identifier" &&
              call.callee.value === "eventual" &&
              call.arguments.length === 1 &&
              call.arguments[0]?.expression.type ===
                "ArrowFunctionExpression") ||
              call.arguments[0]?.expression.type === "FunctionExpression") &&
            !call.arguments[0].expression.generator
          ) {
            const func = call.arguments[0].expression;
            return enterEventual(() => {
              if (func.type === "ArrowFunctionExpression") {
                return this.visitArrowFunctionExpression?.(func) ?? func;
              } else {
                return this.visitFunctionExpression?.(func) ?? func;
              }
            });
          } else if (
            inEventualFunction &&
            call.callee.type === "MemberExpression" &&
            call.callee.object.type === "Identifier" &&
            call.callee.object.value === "Promise" &&
            call.callee.property.type === "Identifier"
          ) {
            if (
              supportedPromiseFunctions.includes(
                call.callee.property.value as any
              )
            ) {
              call.callee.object.value = "Activity";
            }
          }
          return call;
        },
      });

      const { code } = await printModule(transformedModule, args.path);

      return {
        contents: code,
        loader: "ts",
      };
    });
  },
};

async function printModule(module: swc.Module, filePath: string) {
  return await swc.print(module, {
    //sourceFileName doesnt set up the sourcemap path the same way as transform does...
    sourceFileName: path.basename(filePath),
    //Instead these two are needed
    filename: path.basename(filePath),
    outputPath: path.dirname(filePath),
    //esbuild will extract these out later
    sourceMaps: "inline",
    jsc: {
      target: "es2022",
    },
  });
}
