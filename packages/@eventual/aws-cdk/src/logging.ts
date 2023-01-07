import { ENV_NAMES } from "@eventual/aws-runtime";
import { AssetHashType, DockerImage, RemovalPolicy } from "aws-cdk-lib";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  Code,
  Function,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { copyFileSync, cpSync, mkdirSync } from "fs";
import path from "path";
import { runtimeEntrypoint } from "./service";
import { NODE_18_X, outDir } from "./utils";

/**
 * Resources used to facilitate service logging.
 */
export class Logging extends Construct {
  /**
   * A layer consumed by service lambdas that can log to the service log.
   */
  public readonly loggingExtensionLayer: LayerVersion;
  /**
   * A common log group for the service.
   */
  public readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.logGroup = new LogGroup(this, "group", {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.loggingExtensionLayer = new LayerVersion(this, "loggingLayer", {
      code: Code.fromAsset("", {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          local: {
            tryBundle: (out) => {
              mkdirSync(path.join(out, "/extensions"));
              // the bootstrap script
              copyFileSync(
                path.join(
                  runtimeEntrypoint(),
                  "../../extension-scripts/service-logger"
                ),
                // the name of this file is the name of the extension
                path.join(out, "/extensions/service-logger")
              );
              // the actual extension
              cpSync(
                outDir(this, "service-logger/index.mjs"),
                path.join(out, "service-logger/index.mjs")
              );
              return true;
            },
          },
          image: DockerImage.fromRegistry("dummy"),
        },
      }),
      compatibleRuntimes: [Runtime.NODEJS_16_X, NODE_18_X],
      compatibleArchitectures: [Architecture.ARM_64, Architecture.X86_64],
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  public grantPutServiceLogs(grantable: IGrantable) {
    this.logGroup.grantWrite(grantable);
  }

  /**
   * Creating and writing to the {@link Logging.logGroup}
   */
  public configurePutServiceLogs(func: Function) {
    this.grantPutServiceLogs(func);
    func.addEnvironment(
      ENV_NAMES.SERVICE_LOG_GROUP_NAME,
      this.logGroup.logGroupName
    );
  }

  /**
   * Configure a lambda to use the {@link Logging.loggingExtensionLayer}.
   */
  public configureLoggingExtension(func: Function) {
    this.configurePutServiceLogs(func);
    func.addLayers(this.loggingExtensionLayer);
  }
}
