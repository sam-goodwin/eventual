import { AwaitedEventual, Context, Program } from "@eventual/core";

declare module "@eventual/core" {
  export interface Workflow<Input, Output> {
    definition: (
      input: Input,
      context: Context
    ) => Program<AwaitedEventual<Output>>;
  }
}
