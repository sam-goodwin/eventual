import { ActivityHandler } from "@eventual/core";

declare module "@eventual/core" {
  export interface Activity<Name, Input, Output> {
    definition: ActivityHandler<Input, Output>;
  }
}
