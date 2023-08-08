import type { AsyncResult, TaskHandler } from "@eventual/core";
import { AsyncTokenSymbol } from "@eventual/core/internal";

declare module "@eventual/core" {
  export interface Task<Name, Input, Output> {
    definition: TaskHandler<Input, Output>;
  }
}

export function isAsyncResult(obj: any): obj is AsyncResult {
  return !!obj && obj[AsyncTokenSymbol] === AsyncTokenSymbol;
}
