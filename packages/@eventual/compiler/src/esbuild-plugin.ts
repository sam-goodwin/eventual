import esBuild from "esbuild";
import {
  ArrowFunctionExpression,
  AwaitExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Module,
  Param,
  parseFile,
  print,
  Span,
  TsType,
} from "@swc/core";
import path from "path";
import Visitor from "@swc/core/Visitor";

export const eventualESPlugin: esBuild.Plugin = {
  name: "eventual",
  setup(build) {
    build.onLoad({ filter: /\.[mc]?[tj]s$/g }, async (args) => {
      // FYI: SWC erases comments: https://github.com/swc-project/swc/issues/6403
      const sourceModule = await parseFile(args.path, {
        syntax: "typescript",
      });

      const outerVisitor = new OuterVisitor();
      const transformedModule = outerVisitor.visitModule(sourceModule);

      // only format the module and return it if we found eventual functions to transform.
      if (outerVisitor.foundEventual) {
        const { code } = await printModule(transformedModule, args.path);

        return {
          contents: code,
          loader: "ts",
        };
      }
      return;
    });
  },
};

const supportedPromiseFunctions: string[] = [
  "all",
  "allSettled",
  "any",
  "race",
];

class OuterVisitor extends Visitor {
  public foundEventual = false;
  public visitTsType(n: TsType): TsType {
    return n;
  }

  public visitCallExpression(call: CallExpression): Expression {
    if (
      isEventualCallee(call.callee) &&
      call.arguments.length === 1 &&
      (call.arguments[0]?.expression.type === "ArrowFunctionExpression" ||
        call.arguments[0]?.expression.type === "FunctionExpression") &&
      !call.arguments[0].expression.generator
    ) {
      this.foundEventual = true;
      return new InnerVisitor().visitExpression(call.arguments[0].expression);
    }
    return super.visitCallExpression(call);
  }
}

export class InnerVisitor extends Visitor {
  public visitTsType(n: TsType): TsType {
    return n;
  }

  public visitAwaitExpression(awaitExpr: AwaitExpression): Expression {
    return {
      type: "YieldExpression",
      delegate: false,
      span: awaitExpr.span,
      argument: this.visitExpression(awaitExpr.argument),
    };
  }

  public visitCallExpression(call: CallExpression): Expression {
    if (
      call.callee.type === "MemberExpression" &&
      call.callee.object.type === "Identifier" &&
      call.callee.object.value === "Promise" &&
      call.callee.property.type === "Identifier"
    ) {
      if (
        supportedPromiseFunctions.includes(call.callee.property.value as any)
      ) {
        call.callee.object.value = "Eventual";
      }
    }
    return super.visitCallExpression(call);
  }

  public visitFunctionExpression(
    funcExpr: FunctionExpression
  ): FunctionExpression {
    return this.wrapEventual({
      ...funcExpr,
      async: false,
      generator: true,
      body: funcExpr.body ? this.visitBlockStatement(funcExpr.body) : undefined,
      params: funcExpr.params.map((param) => this.visitParameter(param)),
    }) as any; // SWC's types are broken, we can return any Expression here
  }

  public visitArrowFunctionExpression(
    funcExpr: ArrowFunctionExpression
  ): Expression {
    return this.wrapEventual(funcExpr);
  }

  private wrapEventual(
    funcExpr: FunctionExpression | ArrowFunctionExpression
  ): CallExpression {
    const call: CallExpression = {
      type: "CallExpression",
      span: funcExpr.span,
      callee: {
        type: "Identifier",
        value: "eventual",
        optional: false,
        span: funcExpr.span,
      },
      arguments: [
        {
          expression: {
            type: "FunctionExpression",
            span: funcExpr.span,
            identifier:
              funcExpr.type === "FunctionExpression"
                ? funcExpr.identifier
                : undefined,
            async: false,
            generator: true,
            body:
              funcExpr.body?.type === "BlockStatement"
                ? this.visitBlockStatement(funcExpr.body)
                : funcExpr.body
                ? {
                    type: "BlockStatement",
                    span: getSpan(funcExpr.body),
                    stmts: [
                      {
                        type: "ReturnStatement",
                        span: getSpan(funcExpr.body),
                        argument: this.visitExpression(funcExpr.body),
                      },
                    ],
                  }
                : undefined,
            params: funcExpr.params.map((param) =>
              param.type === "Parameter"
                ? this.visitParameter(param)
                : <Param>{
                    type: "Parameter",
                    pat: this.visitPattern(param),
                    span: (<any>param).span ?? funcExpr.span,
                  }
            ),
          },
        },
      ],
    };
    return call;
  }
}

function getSpan(expr: Expression): Span {
  if ("span" in expr) {
    return expr.span;
  } else {
    // this is only true for JSXExpressions which we should not encounter
    throw new Error(`cannot get span of ${expr.type}`);
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
