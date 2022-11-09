import {
  ArrowFunctionExpr,
  FunctionExpr,
  FunctionlessNode,
  isAwaitExpr,
  isBlockStmt,
  isCallExpr,
  isExprStmt,
  isFunctionExpr,
  isIdentifier,
  isVariableDecl,
} from "@functionless/ast";
import ulid from "ulid";

export interface State {
  /**
   * The ID of the Node to continue from.
   */
  continueFromNodeId?: string;
  stack: Frame[];
}

function lookupName(state: State, id: string): { found: any } | undefined {
  for (const frame of state.stack) {
    if (id in frame) {
      return { found: frame[id] };
    }
  }
  return undefined;
}

export interface Frame {
  [id: string]: any;
}

export async function interpretWorkflow(
  node: FunctionExpr | ArrowFunctionExpr,
  state: State
) {
  if (state.continueFromNodeId === undefined) {
  } else {
    // this is a continuation
  }
}

const createULID = ulid.factory();

async function interpret(
  node: FunctionlessNode,
  state: State,
  returnID: string
): Promise<void> {
  if (isAwaitExpr(node)) {
    const returnId = createULID();
  } else if (isCallExpr(node)) {
    // check if this is an activity
  } else if (isBlockStmt(node)) {
  } else if (isExprStmt(node)) {
  } else if (isVariableDecl(node)) {
  }
}
