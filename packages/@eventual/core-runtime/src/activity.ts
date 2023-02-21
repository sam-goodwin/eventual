import { ActivityHandler } from "@eventual/core";

declare module "@eventual/core" {
  export interface Activity<Name, Arguments, Output> {
    definition: ActivityHandler<Arguments, Output>;
  }
}
