import { Handler } from "aws-lambda";

export interface TestPayload {
  a: number;
  b: number;
}

export const handler: Handler<TestPayload, number> = async (input) => {
  if (input.a === 0 && input.b === 0) {
    throw new Error("Wrong!");
  }
  return input.a + input.b;
};
