import { Handler } from "aws-lambda";
import { AWSHttpEventualClient } from "@eventual/aws-client";

const serviceClient = new AWSHttpEventualClient({
  serviceUrl: process.env.TEST_SERVICE_URL ?? "",
});

export interface AsyncWriterTestEvent {
  type: "complete" | "fail";
  token: string;
}

export const handle: Handler<AsyncWriterTestEvent[], void> = async (event) => {
  console.log(event);
  console.log(
    await Promise.allSettled(
      event.map(async (e) => {
        if (e.type === "complete") {
          await serviceClient.sendTaskSuccess({
            taskToken: e.token,
            result: "hello from the async writer!",
          });
        } else {
          await serviceClient.sendTaskFailure({
            taskToken: e.token,
            error: "AsyncWriterError",
            message: "I was told to fail this task, sorry.",
          });
        }
      })
    )
  );
};
