import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  LazyValue,
  TaskClient,
  TaskClientProps,
  TaskProvider,
  TaskWorkerRequest,
  getLazy,
} from "@eventual/core-runtime";
import { Buffer } from "buffer";
import { taskServiceFunctionName } from "../utils.js";

export interface AWSTaskClientProps extends TaskClientProps {
  lambda: LambdaClient;
  taskProvider: TaskProvider;
  serviceName: LazyValue<string>;
}

export class AWSTaskClient extends TaskClient {
  constructor(private _props: AWSTaskClientProps) {
    super(_props);
  }

  public async startTask(request: TaskWorkerRequest): Promise<void> {
    const task = this._props.taskProvider.getTask(request.taskName);
    if (!task) {
      throw new Error(`Task ${request.taskName} does not exist.`);
    } else {
      const functionName = taskServiceFunctionName(
        getLazy(this._props.serviceName),
        request.taskName
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
