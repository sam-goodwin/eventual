import { WorkflowContext } from "@eventual/core";

declare module "@eventual/core" {
  export interface Workflow<Input, Output> {
    definition: (
      input: Input,
      context: WorkflowContext
    ) => Promise<Awaited<Output>>;
  }
}
