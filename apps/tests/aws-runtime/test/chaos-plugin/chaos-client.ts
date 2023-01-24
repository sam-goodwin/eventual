import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { ChaosTestConfig, ChaosRule } from "./chaos-engine.js";

export interface ChaosClient {
  getConfiguration(): Promise<ChaosTestConfig>;
  setConfiguration(config: ChaosTestConfig): Promise<void>;
  setRule(rule: any): Promise<void>;
  removeRule(name: string): Promise<void>;
  disable(): Promise<void>;
  enable(): Promise<void>;
}

/**
 * Implementation of {@link ChaosClient} using SSM Parameters.
 *
 * {@link ChaosClient} helps retrieve and update {@link ChaosTestConfig} from
 * the runtime and test utilities.
 */
export class SSMChaosClient implements ChaosClient {
  constructor(private paramName: string, private ssm: SSMClient) {}

  async getConfiguration() {
    const param = await this.ssm.send(
      new GetParameterCommand({
        Name: this.paramName,
      })
    );

    const rawValue = param.Parameter?.Value;
    if (!rawValue) {
      console.log("Chaos testing value not found, testing disabled.");
      return { disabled: true };
    }

    return JSON.parse(rawValue) as ChaosTestConfig;
  }

  async setConfiguration(config: ChaosTestConfig): Promise<void> {
    await this.ssm.send(
      new PutParameterCommand({
        Name: this.paramName,
        Value: JSON.stringify(config),
        Overwrite: true,
      })
    );
  }

  async setRule(rule: ChaosRule): Promise<void> {
    const config = await this.getConfiguration();
    await this.setConfiguration({
      ...config,
      rules: [...(config.rules ?? []), rule],
    });
  }

  async removeRule(name: string): Promise<void> {
    const config = await this.getConfiguration();
    const rules = config.rules?.filter((r) => r.name !== name);
    await this.setConfiguration({
      ...config,
      rules,
    });
  }

  async disable(): Promise<void> {
    const config = await this.getConfiguration();
    await this.setConfiguration({
      ...config,
      disabled: true,
    });
  }

  async enable(): Promise<void> {
    const config = await this.getConfiguration();
    await this.setConfiguration({
      ...config,
      disabled: false,
    });
  }
}
