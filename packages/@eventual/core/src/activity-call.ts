import { isFuture, FutureSymbol, FutureKind } from "./future";
import { registerActivity } from "./global";
import { Resolved, Failed } from "./result";

export function isActivityCall(a: any): a is ActivityCall {
  return isFuture(a) && a[FutureSymbol] === FutureKind.ActivityCall;
}

export interface ActivityCall<T = any> {
  [FutureSymbol]: FutureKind.ActivityCall;
  seq?: number;
  name: string;
  args: any[];
  result?: Resolved<T> | Failed;
}

export function createActivityCall(
  name: string,
  args: any[],
  seq?: number
): ActivityCall {
  const command: ActivityCall = {
    [FutureSymbol]: FutureKind.ActivityCall,
    seq,
    name,
    args,
  };
  if (seq !== undefined) {
    // if seq is passed in, then this Command is assumed to be in a dev environment
    // so - do not register it
    return command;
  } else {
    return registerActivity<ActivityCall>(command);
  }
}
