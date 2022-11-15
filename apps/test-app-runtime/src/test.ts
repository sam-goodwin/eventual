import { Handler } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { StartWorkflowRequest } from "@eventual/aws-runtime";
import type { OpenAccountRequest } from "./open-account.js";

const lambda = new LambdaClient({});
const workflowStartFunction = process.env.WORKFLOW_STARTER;

export const handler: Handler<{ count: number }> = async ({ count }) => {
  for (let i = 0; i < count; i++) {
    const bankRequest: OpenAccountRequest = {
      accountId: String(i),
      address: { address1: "", postalCode: "", address2: "" },
      bankDetails: {
        accountNumber: String(i),
        accountType: "something",
        personalOwner: { firstName: "sam", lastName: "sussman" },
        routingNumber: "",
      },
      email: "",
    };
    const request: StartWorkflowRequest = {
      input: bankRequest,
    };

    await lambda.send(
      new InvokeCommand({
        FunctionName: workflowStartFunction,
        Payload: Buffer.from(JSON.stringify(request)),
      })
    );
  }
};
