import { ENV_NAMES } from "@eventual/aws-runtime";
import lambda, {
  Architecture,
  Code,
  ILayerVersion,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
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
  logStreams: ILogStream[];
  collectorLayer: ILayerVersion;
}

export class Telemetry extends Construct {
  logGroup: LogGroup;
  logStreams: ILogStream[] = [];
  collectorLayer: ILayerVersion;

  constructor(scope: Construct, id: string, props: TelemetryProps) {
    super(scope, id);

    this.logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: `${props.serviceName}-telemetry`,
    });

    this.collectorLayer = new LayerVersion(this, "telemetry-collector", {
      code: Code.fromAsset(
        require.resolve("@eventual/aws-runtime/mini-collector-cloudwatch")
      ),
      compatibleArchitectures: [Architecture.ARM_64],
    });
  }

  attachToFunction(fn: lambda.Function, componentName: string) {
    const logStream = new LogStream(this, `LogStream${componentName}`, {
      logGroup: this.logGroup,
      logStreamName: componentName,
    });
    fn.addEnvironment(
      ENV_NAMES.TELEMETRY_LOG_GROUP_NAME,
      this.logGroup.logGroupName
    );
    fn.addEnvironment(
      ENV_NAMES.TELEMETRY_LOG_STREAM_NAME,
      logStream.logStreamName
    );
    fn.addEnvironment(ENV_NAMES.TELEMETRY_COMPONENT_NAME, componentName);
    fn.addLayers(this.collectorLayer);
    this.logStreams.push(logStream);
  }
}
