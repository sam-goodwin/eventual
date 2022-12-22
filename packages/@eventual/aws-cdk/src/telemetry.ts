import { ENV_NAMES } from "@eventual/aws-runtime";
import lambda, {
  Architecture,
  Code,
  ILayerVersion,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { ILogGroup, LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface TelemetryProps {
  serviceName: string;
}

export interface ITelemetry {
  logGroup: ILogGroup;
  collectorLayer: ILayerVersion;
}

export class Telemetry extends Construct {
  logGroup: LogGroup;
  collectorLayer: ILayerVersion;

  constructor(scope: Construct, id: string, props: TelemetryProps) {
    super(scope, id);

    this.logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: `${props.serviceName}-opentelemetry-data`,
    });

    this.collectorLayer = new LayerVersion(this, "telemetry-collector", {
      code: Code.fromAsset(require.resolve("@eventual/aws-runtime/collector")),
      compatibleArchitectures: [Architecture.ARM_64],
    });
  }

  configureFunctions(...fns: lambda.Function[]) {
    for (const fn of fns) {
      fn.addEnvironment(
        ENV_NAMES.TELEMETRY_LOG_GROUP_NAME,
        this.logGroup.logGroupName
      );
      fn.addEnvironment("GRPC_TRACE", "all");
      fn.addEnvironment("GRPC_VERBOSITY", "DEBUG");
      fn.addLayers(this.collectorLayer);
    }
  }
}
