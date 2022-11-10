import esBuild from "esbuild";
import {
  ArrowFunctionExpression,
  AwaitExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Module,
  parseFile,
  print,
  Span,
} from "@swc/core";
import path from "path";
import Visitor from "@swc/core/Visitor";

export const eventualESPlugin: esBuild.Plugin = {
  name: "eventual",
  setup(build) {
    build.onLoad({ filter: /\.[tj]s/g }, async (args) => {
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
    if (this.inEventualFunction) {
      return {
        ...funcExpr,
        async: true,
        generator: false,
      };
    }
    return funcExpr;
  }

  public visitArrowFunctionExpression(
    funcExpr: ArrowFunctionExpression
  ): ArrowFunctionExpression | FunctionExpression {
    if (this.inEventualFunction) {
      return {
        ...funcExpr,
        type: "FunctionExpression",
        async: false,
        generator: true,
        params: funcExpr.params.map((pat) => ({
          type: "Parameter",
          pat,
          span:
            (<any>pat).span ??
            <Span>{
              ctxt: 0,
              end: 0,
              start: 0,
            },
        })),
        body:
          funcExpr.body.type === "BlockStatement"
            ? this.visitBlockStatement(funcExpr.body)
            : {
                type: "BlockStatement",
                span: funcExpr.span,
                stmts: [
                  {
                    type: "ExpressionStatement",
                    span: funcExpr.span,
                    expression: this.visitExpression(funcExpr),
                  },
                ],
              },
      };
    }
    return funcExpr;
  }

  public visitCallExpression(call: CallExpression): Expression {
    if (
      ((isEventualCallee(call.callee) &&
        call.arguments.length === 1 &&
        call.arguments[0]?.expression.type === "ArrowFunctionExpression") ||
        call.arguments[0]?.expression.type === "FunctionExpression") &&
      !call.arguments[0].expression.generator
    ) {
      const func = call.arguments[0].expression;
      call.arguments[0].expression = this.enterEventual(() => {
        return this.visitExpression(func);
      });
      return call;
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
    return super.visitCallExpression(call);
  }
}

function isEventualCallee(callee: CallExpression["callee"]) {
  return (
    (callee.type === "Identifier" && callee.value === "eventual") ||
    (callee.type === "MemberExpression" &&
      callee.property.type === "Identifier" &&
      callee.property.value === "eventual")
  );
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
