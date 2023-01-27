import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { ActivityWorkerRequest } from "@eventual/core";
import {
  ActivityClient,
  ActivityClientProps,
  getLazy,
  LazyValue,
} from "@eventual/runtime-core";

export interface AWSActivityClientProps extends ActivityClientProps {
  lambda: LambdaClient;
  activityWorkerFunctionName: LazyValue<string>;
}

export class AWSActivityClient extends ActivityClient {
  constructor(private _props: AWSActivityClientProps) {
    super(_props);
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    await this._props.lambda.send(
      new InvokeCommand({
        FunctionName: getLazy(this._props.activityWorkerFunctionName),
        Payload: Buffer.from(JSON.stringify(request)),
        InvocationType: InvocationType.Event,
      })
    );
  }
}
