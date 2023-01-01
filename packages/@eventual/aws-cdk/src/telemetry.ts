import { ENV_NAMES } from "@eventual/aws-runtime";
import { DockerImage, Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  FunctionUrl,
  IFunction,
  Runtime,
  Function,
  FunctionUrlAuthType,
  LayerVersion,
  Tracing,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";
import fs from "fs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export interface TelemetryProps {
  collectorConfigPath?: string;
}

export interface ITelemetry {
  collectorFn: IFunction;
  collectorFnUrl: FunctionUrl;
}

export class Telemetry extends Construct {
  collectorFn: IFunction;
  collectorFnUrl: FunctionUrl;
  collectorConfigPath?: string;

  constructor(scope: Construct, id: string, props?: TelemetryProps) {
    super(scope, id);

    let collectorConfigPath =
      props?.collectorConfigPath ??
      require.resolve(
        "@eventual/aws-runtime/otlp-proxy-lambda/otel-config.yaml"
      );

    this.collectorFn = new Function(this, "collector", {
      runtime: Runtime.PROVIDED_AL2,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      handler: "bootstrap",
      code: Code.fromAsset(
        require.resolve("@eventual/aws-runtime/otlp-proxy-lambda/bootstrap.zip")
      ),
      layers: [
        new LayerVersion(this, "otel-collector-extension", {
          code: Code.fromAsset(
            require.resolve(
              "@eventual/aws-runtime/otlp-proxy-lambda/collector-extension.zip"
            )
          ),
        }),
        new LayerVersion(this, "otel-config", {
          code: Code.fromAsset(path.dirname(collectorConfigPath), {
            bundling: {
              image: new DockerImage(""),
              local: {
                tryBundle(outputDir, _options) {
                  fs.copyFileSync(
                    collectorConfigPath!,
                    path.join(outputDir, path.basename(collectorConfigPath)),
                    fs.constants.COPYFILE_FICLONE
                  );
                  return true;
                },
              },
            },
          }),
        }),
      ],
      environment: {
        OPENTELEMETRY_COLLECTOR_CONFIG_FILE: `/opt/${path.basename(
          collectorConfigPath
        )}`,
      },
      initialPolicy: [
        new PolicyStatement({
          actions: [
            "xray:PutTraceSegments",
            "xray:PutTelemetryRecords",
            "xray:GetSamplingRules",
            "xray:GetSamplingTargets",
            "xray:GetSamplingStatisticSummaries",
          ],
          resources: ["*"],
          effect: Effect.ALLOW,
        }),
      ],
      tracing: Tracing.ACTIVE
    });
    this.collectorFn;
    this.collectorFnUrl = this.collectorFn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });
  }

  configureFunction(fn: Function, componentName: string) {
    fn.addEnvironment(
      ENV_NAMES.OTEL_EXPORTER_OTLP_ENDPOINT,
      this.collectorFnUrl.url
    );
    fn.addEnvironment(ENV_NAMES.TELEMETRY_COMPONENT_NAME, componentName);
  }
}
