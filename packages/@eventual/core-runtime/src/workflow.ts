import { WorkflowContext } from "@eventual/core";
import { Program, AwaitedEventual } from "@eventual/core/internal";

declare module "@eventual/core" {
  export interface Workflow<Input, Output> {
    definition: (
      input: Input,
      context: WorkflowContext
    ) => Program<AwaitedEventual<Output>>;
  }
}
