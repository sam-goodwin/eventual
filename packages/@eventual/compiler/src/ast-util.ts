import {
  CallExpression,
  ComputedPropName,
  Expression,
  HasSpan,
  Identifier,
  Node,
  Span,
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
    (c.type == "Identifier" && c.value === "command") ||
    (c.type === "MemberExpression" && isId(c.property, "command"))
  ) {
    return call.arguments.length === 2 || call.arguments.length === 3;
  }
  return false;
}

/**
 * A heuristic for identifying a {@link CallExpression} that is a call to an `onEvent` handler.
 *
 * 1. must be a call to a MemberExpression matching to `<expression>.onEvent(name, impl | props, impl)`.
 * 2. must have 2 or 3 arguments.
 */
export function isOnEventCall(call: CallExpression): boolean {
  const c = call.callee;
  if (c.type === "MemberExpression") {
    if (isId(c.property, "onEvent")) {
      // eventType.onEvent(async () => { })
      return call.arguments.length === 2 || call.arguments.length === 3;
    }
  }
  return false;
}

/**
 * A heuristic for identifying a {@link CallExpression} that is a call to an `subscription` handler.
 *
 * 1. must be a call to an `subscription(name, props, impl)` or a MemberExpression matching to `<expression>.subscription(name,  props, impl)`.
 * 2. must have exactly 3 arguments.
 */
export function isSubscriptionCall(call: CallExpression): boolean {
  const c = call.callee;
  if (
    (c.type == "Identifier" && c.value === "subscription") ||
    (c.type === "MemberExpression" && isId(c.property, "subscription"))
  ) {
    return call.arguments.length === 3;
  }
  return false;
}

/**
 * A heuristic for identifying a {@link CallExpression} that is a call to an `activity` handler.
 *
 * 1. must be a call to an `activity(name, [props, impl] | [impl])` or a MemberExpression matching to `<expression>.activity(name,  [props, impl] | [impl])`.
 * 2. must have exactly 2 to 3 arguments.
 */
export function isActivityCall(call: CallExpression): boolean {
  const c = call.callee;
  if (
    (c.type == "Identifier" && c.value === "activity") ||
    (c.type === "MemberExpression" && isId(c.property, "activity"))
  ) {
    return call.arguments.length === 2 || call.arguments.length === 3;
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
