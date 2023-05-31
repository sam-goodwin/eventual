import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Code, Function, LayerVersion } from "aws-cdk-lib/aws-lambda";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { AssetHashType, DockerImage } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import esbuild from "esbuild";
import fs from "fs";
import { createRequire as topLevelCreateRequire } from "module";
import path from "path";
import * as url from "url";

const require = topLevelCreateRequire(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

/**
 * Chaos testing extension for lambda. Used in conjunction with Eventual's
 * EVENTUAL_AWS_SDK_PLUGIN env variable to plug the aws-sdk.
 *
 * Allows changing the behavior (reject, timeouts, delay, etc) of the AwsSDK during eventual operation
 * to test for durability and reliability.
 */
export class ChaosExtension extends Construct {
  public ssm: StringParameter;
  public layer: LayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.ssm = new StringParameter(this, "param", {
      stringValue: '{ "disabled": true }',
    });

    const chaosLayerEntry = path.join(
      require.resolve("tests-runtime"),
      "../chaos-extension/index.js"
    );

    this.layer = new LayerVersion(this, "extensionLayer", {
      code: Code.fromAsset(path.dirname(chaosLayerEntry), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          image: DockerImage.fromRegistry("dummy"),
          local: {
            tryBundle: (outLoc) => {
              esbuild.buildSync({
                entryPoints: [chaosLayerEntry],
                bundle: true,
                outfile: `${outLoc}/chaos-ext/index.js`,
                platform: "node",
                // cannot currently import modules from layers.
                format: "cjs",
                // Target for node 18
                target: "es2022",
              });
              fs.mkdirSync(`${outLoc}/extensions`);
              fs.cpSync(
                path.resolve(__dirname, "../scripts/extensions/chaos-ext"),
                `${outLoc}/chaos-ext-start`
              );
              return true;
            },
          },
        },
      }),
    });
  }

  /**
   * Configures a lambda to use the chaos extension.
   *
   * * Add a layer containing the extension code.
   * * Use the Lambda Exec Wrapper (AWS_LAMBDA_EXEC_WRAPPER) to add the --require parameter
   * * Injects the ssm parameter name to the extension (EVENTUAL_CHAOS_TEST_PARAM)
   * * Tells eventual where to find the aws-sdk plugin code (EVENTUAL_AWS_SDK_PLUGIN)
   */
  public addToFunction(func: Function) {
    func.addLayers(this.layer);
    func.addEnvironment("AWS_LAMBDA_EXEC_WRAPPER", "/opt/chaos-ext-start");
    func.addEnvironment("EVENTUAL_AWS_SDK_PLUGIN", "/opt/chaos-ext/index.js");
    func.addEnvironment("EVENTUAL_CHAOS_TEST_PARAM", this.ssm.parameterName);
    this.ssm.grantRead(func);
  }

  /**
   * Grant the ability to read and write the SSM parameter used by the chaos extension.
   *
   * This is required to use the {@link SSMChaosClient}.
   */
  public grantReadWrite(grantable: IGrantable) {
    this.ssm.grantRead(grantable);
    this.ssm.grantWrite(grantable);
  }
}
