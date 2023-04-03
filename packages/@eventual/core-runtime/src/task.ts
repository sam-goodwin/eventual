import { TaskHandler } from "@eventual/core";

declare module "@eventual/core" {
  export interface Task<Name, Input, Output> {
    definition: TaskHandler<Input, Output>;
  }
}
