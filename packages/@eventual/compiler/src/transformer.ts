/* eslint-disable no-bitwise */
import path from "path";
import { makeEventualChecker } from "./checker";
import minimatch from "minimatch";
import type { PluginConfig, TransformerExtras } from "ts-patch";
import ts from "typescript";
import { Kind } from "@eventual/core";

export default compile;

/**
 * Configuration options for the eventual TS transform.
 */
export interface EventualConfig extends PluginConfig {
  /**
   * Glob to exclude
   */
  exclude?: string[];
}

/**
 * TypeScript Transformer that transforms all instances of
 * Eventual's `workflow` macro into its AST form.
 *
 * @param program the TypeScript {@link ts.Program}
 * @param config the {@link EventualConfig}.
 * @param _extras
 * @returns the transformer
 */
export function compile(
  program: ts.Program,
  _config?: EventualConfig,
  _extras?: TransformerExtras
): ts.TransformerFactory<ts.SourceFile> {
  const excludeMatchers = _config?.exclude
    ? _config.exclude
        .map((pattern) => minimatch.makeRe(path.resolve(pattern)))
        .filter((regex): regex is RegExp => !!regex)
    : [];
  const checker = makeEventualChecker(program.getTypeChecker());

  return (ctx) => {
    const eventual = ts.factory.createUniqueName("eventual");
    return (sf) => {
      // Do not transform any of the files matched by "exclude"
      if (excludeMatchers.some((matcher) => matcher.test(sf.fileName))) {
        return sf;
      }

      const context = {
        requireEventual: false,
        get eventual() {
          this.requireEventual = true;
          return eventual;
        },
      };

      const importEventualRuntime = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(eventual)
        ),
        ts.factory.createStringLiteral("@eventual/runtime")
      );

      const globals: (ts.FunctionDeclaration | ts.Statement)[] = [
        importEventualRuntime,
      ];

      const statements = globals.concat(
        sf.statements.map(
          (stmt) => visitor(stmt) as ts.Statement | ts.FunctionDeclaration
        )
      );

      return ts.factory.updateSourceFile(
        sf,
        [
          // only require eventual if it is used.
          ...(context.requireEventual ? [importEventualRuntime] : []),
          ...statements,
        ],
        sf.isDeclarationFile,
        sf.referencedFiles,
        sf.typeReferenceDirectives,
        sf.hasNoDefaultLib,
        sf.libReferenceDirectives
      );

      function visitor(node: ts.Node): ts.Node | ts.Node[] {
        if (ts.isCallExpression(node)) {
          const exprType = checker.getTypeAtLocation(node.expression);
          const exprKind = checker.getKindOfType(exprType);
          if (exprKind === Kind.Workflow) {
            if (
              ts.isArrowFunction(node.expression) ||
              ts.isFunctionExpression(node.expression)
            ) {
              // TODO replace the call
            }
          }
        }

        // nothing special about this node, continue walking
        return ts.visitEachChild(node, visitor, ctx);
      }
    };
  };
}
