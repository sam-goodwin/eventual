import {
  Argument,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Span,
  Node,
  StringLiteral,
  FunctionDeclaration,
  Statement,
  HasSpan,
  Identifier,
  ComputedPropName,
} from "@swc/core";

/**
 * A heuristic for identifying a {@link CallExpression} that is a call to an API handler.
 *
 * 1. must be a call to a MemberExpression matching to `api.get` or
 *    `ev.api.get` where `get` is any of the allowed {@link apiCalls}.
 * 2. Must have between 2 and 3 arguments.
 */
export function isCommandCall(call: CallExpression): boolean {
  const c = call.callee;
  if (
    (c.type !== "Identifier" || c.value === "command") &&
    (c.type !== "MemberExpression" || isId(c.property, "command"))
  ) {
    return false;
  }

  return call.arguments.length === 2 || call.arguments.length === 3;
}

/**
 * A heuristic for identifying a {@link CallExpression} that is a call to an `onEvent` handler.
 *
 * 1. must be a call to a MemberExpression matching to `<expression>.onEvent(impl | props, impl)`.
 * 2. must have 1 or 2 arguments.
 */
export function isOnEventCall(call: CallExpression): boolean {
  const c = call.callee;
  if (c.type === "MemberExpression") {
    if (isId(c.property, "onEvent")) {
      // eventType.onEvent(async () => { })
      return call.arguments.length === 1 || call.arguments.length === 2;
    }
  }
  return false;
}

/**
 * Checks whether a {@link node} is an {@link Identifier} with a value of {@link Value}.
 */
function isId<Value extends string>(
  node: Expression | ComputedPropName,
  value: Value | Set<Value> | undefined
): node is Identifier & {
  value: Value;
} {
  return (
    node.type === "Identifier" &&
    (value === undefined ||
      (typeof value === "string"
        ? node.value === value
        : value.has(node.value as any)))
  );
}

/**
 * A heuristic for identifying a {@link CallExpression} that is a call
 * to the eventual.workflow utility:
 *
 * 1. must be a function call with exactly 2 arguments
 * 2. first argument is a string literal
 * 3. second argument is a FunctionExpression or ArrowFunctionExpression
 * 4. callee is an identifier `"workflow"` or `<identifier>.workflow`
 */
export function isWorkflowCall(call: CallExpression): call is CallExpression & {
  arguments: [
    Argument & { expression: StringLiteral },
    Argument & { expression: FunctionExpression | ArrowFunctionExpression }
  ];
} {
  return (
    isWorkflowCallee(call.callee) &&
    call.arguments[0]?.expression.type === "StringLiteral" &&
    ((call.arguments.length === 2 &&
      isNonGeneratorFunction(call.arguments[1]?.expression)) ||
      (call.arguments.length === 3 &&
        isNonGeneratorFunction(call.arguments[2]?.expression)))
  );
}

export function isNonGeneratorFunction(
  expr?: Expression
): expr is ArrowFunctionExpression | FunctionExpression {
  return (
    (expr?.type === "ArrowFunctionExpression" ||
      expr?.type === "FunctionExpression") &&
    !expr.generator
  );
}

export function isActivityCallee(callee: CallExpression["callee"]) {
  return isCallee("activity", callee);
}

export function isWorkflowCallee(callee: CallExpression["callee"]) {
  return isCallee("workflow", callee);
}

export function isCallee(
  type: "activity" | "workflow",
  callee: CallExpression["callee"]
) {
  return (
    (callee.type === "Identifier" && callee.value === type) ||
    (callee.type === "MemberExpression" &&
      callee.property.type === "Identifier" &&
      callee.property.value === type)
  );
}

export function isAsyncFunctionDecl(
  stmt: Statement
): stmt is FunctionDeclaration & { async: true } {
  return stmt.type === "FunctionDeclaration" && stmt.async;
}

export function hasSpan(expr: Node): expr is Node & HasSpan {
  return "span" in expr;
}

export function getSpan(expr: Node): Span {
  if (hasSpan(expr)) {
    return expr.span;
  } else {
    // this is only true for JSXExpressions which we should not encounter
    throw new Error(`cannot get span of ${expr.type}`);
  }
}
