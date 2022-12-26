import { ENV_NAMES } from "@eventual/aws-runtime";
import { Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  FunctionUrl,
  IFunction,
  Runtime,
  Function,
  FunctionUrlAuthType,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface ITelemetry {
  collectorFn: IFunction;
  collectorFnUrl: FunctionUrl;
}

export class Telemetry extends Construct {
  collectorFn: IFunction;
  collectorFnUrl: FunctionUrl;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.collectorFn = new Function(this, "collector", {
      runtime: Runtime.PROVIDED_AL2,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      handler: "bootstrap",
      code: Code.fromAsset(
        require.resolve("@eventual/aws-runtime/collector/lambda-collector.zip")
      ),
      layers: [
        new LayerVersion(this, "otel-collector-extension", {
          code: Code.fromAsset(
            require.resolve(
              "@eventual/aws-runtime/collector/collector-extension.zip"
            )
          ),
        }),
      ],
    });
    this.collectorFnUrl = this.collectorFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });
  }

  configureFunction(fn: Function, componentName: string) {
    fn.addEnvironment(
      ENV_NAMES.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      this.collectorFnUrl.url
    );
    fn.addEnvironment(ENV_NAMES.TELEMETRY_COMPONENT_NAME, componentName);
    fn.addEnvironment();
  }
}
