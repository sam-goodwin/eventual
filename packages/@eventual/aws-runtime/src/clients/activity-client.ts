import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  ActivityClient,
  ActivityClientProps,
  ActivityProvider,
  ActivityWorkerRequest,
} from "@eventual/core-runtime";
import { Buffer } from "buffer";
import { activityServiceFunctionName } from "../utils.js";

export interface AWSActivityClientProps extends ActivityClientProps {
  lambda: LambdaClient;
  activityProvider: ActivityProvider;
  serviceName: string;
}

export class AWSActivityClient extends ActivityClient {
  constructor(private _props: AWSActivityClientProps) {
    super(_props);
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    const activity = this._props.activityProvider.getActivity(
      request.command.name
    );
    if (!activity) {
      throw new Error(`Activity ${request.command.name} does not exist.`);
    } else {
      const functionName = activityServiceFunctionName(
        this._props.serviceName,
        request.command.name
      );
      await this._props.lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: Buffer.from(JSON.stringify(request)),
          InvocationType: InvocationType.Event,
        })
      );
      return;
    }
  }
}
