import {
  ILogGroup,
  ILogStream,
  LogGroup,
  LogStream,
} from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface TelemetryProps {
  serviceName: string;
}

export interface ITelemetry {
  logGroup: ILogGroup;
  logStream: ILogStream;

  env: ITelemetryEnv;
}

export interface ITelemetryEnv {
  logGroupName: string;
  logStreamName: string;
}

export class Telemetry extends Construct {
  logGroup: LogGroup;
  logStream: LogStream;

  constructor(scope: Construct, id: string, props: TelemetryProps) {
    super(scope, id);

    this.logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: `${props.serviceName}-opentelemetry-data`,
    });
    this.logStream = this.logGroup.addStream("LogStream", {
      logStreamName: "traces",
    });
  }

  get env(): ITelemetryEnv {
    return {
      logGroupName: this.logGroup.logGroupName,
      logStreamName: this.logStream.logStreamName,
    };
  }
}
