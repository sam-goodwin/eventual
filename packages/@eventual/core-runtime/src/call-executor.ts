import {
  CallKind,
  CallSymbol,
  type Call,
  type CallOutput,
  type EventualPromise,
} from "@eventual/core/internal";

export interface CallExecutor<E extends Call = Call> {
  execute(call: E): EventualPromise<CallOutput<E>> | Promise<CallOutput<E>>;
}

export type AllCallExecutors = {
  [K in keyof typeof CallKind]: CallExecutor<
    Call & { [CallSymbol]: (typeof CallKind)[K] }
  >;
};

export class UnsupportedExecutor<E extends Call = Call>
  implements CallExecutor<E>
{
  constructor(private name: string) {}
  public execute(_call: E): EventualPromise<any> {
    throw new Error(
      `Call type ${CallKind[_call[CallSymbol]]} is not supported by ${
        this.name
      }.`
    );
  }
}

/**
 * An executor that can execute any eventual executor.
 */
export class AllCallExecutor implements CallExecutor {
  constructor(private executors: AllCallExecutors) {}
  public execute<E extends Call>(call: E) {
    const kind = call[CallSymbol];
    const executor = this.executors[CallKind[kind] as keyof typeof CallKind] as
      | CallExecutor
      | undefined;

    if (executor) {
      return executor.execute(call) as unknown as EventualPromise<any>;
    }

    throw new Error(`Missing Executor for ${CallKind[kind]}`);
  }
}
