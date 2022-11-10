import esBuild from "esbuild";
import {
  AwaitExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Module,
  Node,
  parseFile,
  print,
} from "@swc/core";
import path from "path";
import Visitor from "@swc/core/Visitor";

export const eventualESPlugin: esBuild.Plugin = {
  name: "Eventual",
  setup(build) {
    build.onLoad({ filter: /\.ts/g }, async (args) => {
      const sourceModule = await parseFile(args.path, {
        syntax: "typescript",
      });

      const transformedModule = new EventualVisitor().visitModule(sourceModule);

      const { code } = await printModule(transformedModule, args.path);

      return {
        contents: code,
        loader: "ts",
      };
    });
  },
};

const supportedPromiseFunctions: (keyof PromiseConstructor)[] = [
  "all",
  "allSettled",
  "any",
  "race",
];

class EventualVisitor extends Visitor {
  private inEventualFunction = false;

  public enterEventual<T>(scope: () => T): T {
    let prevInEventualFunction = this.inEventualFunction;
    this.inEventualFunction = true;
    const result = scope();
    this.inEventualFunction = prevInEventualFunction;
    return result;
  }

  public visit(mod: Module): Module;
  public visit(node: Expression): Expression;
  public visit(node: Node): Node;
  public visit(node: Node): Node {
    return (this[`visit${node.type}` as any as keyof this] as any)(node);
  }

  public visitAwaitExpression(awaitExpr: AwaitExpression): Expression {
    if (this.inEventualFunction) {
      return {
        type: "YieldExpression",
        delegate: false,
        span: awaitExpr.span,
        argument: awaitExpr.argument,
      };
    }
    return awaitExpr;
  }

  public visitFunctionExpression(
    funcExpr: FunctionExpression
  ): FunctionExpression {
    if (this.inEventualFunction && funcExpr.generator) {
      return {
        ...funcExpr,
        async: true,
        generator: false,
      };
    }
    return funcExpr;
  }
  public visitCallExpression(call: CallExpression): Expression {
    if (
      ((call.callee.type === "Identifier" &&
        call.callee.value === "eventual" &&
        call.arguments.length === 1 &&
        call.arguments[0]?.expression.type === "ArrowFunctionExpression") ||
        call.arguments[0]?.expression.type === "FunctionExpression") &&
      !call.arguments[0].expression.generator
    ) {
      const func = call.arguments[0].expression;
      return this.enterEventual(() => this.visit(func));
    } else if (
      this.inEventualFunction &&
      call.callee.type === "MemberExpression" &&
      call.callee.object.type === "Identifier" &&
      call.callee.object.value === "Promise" &&
      call.callee.property.type === "Identifier"
    ) {
      if (
        supportedPromiseFunctions.includes(call.callee.property.value as any)
      ) {
        call.callee.object.value = "Activity";
      }
    }
    return call;
  }
}

async function printModule(module: Module, filePath: string) {
  return await print(module, {
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
