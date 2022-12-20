import { EventualError } from "@eventual/core";

export class InProgressError extends EventualError {
  constructor(message: string) {
    super("InProgressError", message);
  }
}
