import { Stack } from "aws-cdk-lib";
import {
  Code,
  Function,
  ILayerVersion,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";

/**
 * Encapsulates lambda layers used to set up opentelemetry
 */
export class OpenTelemetry extends Construct {
  private layers: ILayerVersion[];

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.layers = [
      // TODO potentially use custom-built layers, not dependent on region and can trim some fat
      // new LayerVersion(this, "OpenTelemetryNode", {
      //   code: Code.fromAsset(
      //     path.join(__dirname, "..", "opentelemetry", "layers", "nodejs-layer.zip")
      //   ),
      // }),
      // new LayerVersion(this, "OpenTelemetryCollector", {
      //   code: Code.fromAsset(
      //     path.join(
      //       __dirname,
      //       "..",
      //       "opentelemetry",
      //       "layers",
      //       "collector-extension.zip"
      //     )
      //   ),
      // }),
      new LayerVersion(this, "OpenTelemetryConfig", {
        code: Code.fromAsset(
          path.join(__dirname, "..", "opentelemetry", "config")
        ),
      }),
      LayerVersion.fromLayerVersionArn(
        this,
        "OpenTelemetryNode",
        `arn:aws:lambda:${
          Stack.of(this).region
        }:901920570463:layer:aws-otel-nodejs-arm64-ver-1-7-0:2`
      ),
    ];
  }

  /**
   * Configure a function to use opentelemetry
   * @param fn
   */
  public configure(fn: Function) {
    fn.addLayers(...this.layers);
    fn.addEnvironment("AWS_LAMBDA_EXEC_WRAPPER", "/opt/otel-handler");
    fn.addEnvironment(
      "OPENTELEMETRY_COLLECTOR_CONFIG_FILE",
      "/opt/collector.yaml"
    );
  }
}
