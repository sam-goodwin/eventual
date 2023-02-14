import { Context } from "@eventual/core";
import { Program, AwaitedEventual } from "@eventual/core/internal";

declare module "@eventual/core" {
  export interface Workflow<Input, Output> {
    definition: (
      input: Input,
      context: Context
    ) => Program<AwaitedEventual<Output>>;
  }
}
