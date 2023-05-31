import { defaultProvider } from "@aws-sdk/credential-provider-node";
import type { IndexSpec } from "@eventual/core/internal";
import {
  Client,
  Connection,
  opensearchtypes,
} from "@opensearch-project/opensearch";
import type { CloudFormationCustomResourceHandler } from "aws-lambda";
import aws4 from "aws4";

const endpoint = process.env.OS_ENDPOINT;

let client: Client;

export const handle: CloudFormationCustomResourceHandler = async (event) => {
  console.log(event);
  console.log(JSON.stringify(event));
  client ??= await (async () => {
    const credentials = await defaultProvider()();
    return new Client({
      node: endpoint,
      Connection: class extends Connection {
        public buildRequestObject(params: any) {
          const request: any = super.buildRequestObject(params);
          request.service = "es";
          request.region = process.env.AWS_REGION!;
          request.headers = request.headers || {};
          request.headers.host = request.hostname;
          return aws4.sign(request, credentials);
        }
      },
    });
  })();

  try {
    const data = await createUpdateOrDelete();
    await sendResult({
      status: "SUCCESS",
      data,
      physicalId: data.IndexName,
    });
  } catch (err: any) {
    console.error(err);
    await sendResult({
      status: "FAILED",
      reason: err.message,
    });
  }

  async function createUpdateOrDelete(): Promise<{
    IndexName: string;
  }> {
    if (event.RequestType === "Create") {
      const props = event.ResourceProperties as any as IndexSpec;
      console.log(`Creating index ${props.index}`, props);
      await client.indices.create({
        index: props.index,
        body: {
          aliases: props.aliases,
          mappings: props.mappings,
          settings: props.settings,
        },
      });
      console.log(`Created index ${props.index}`);
      return {
        IndexName: props.index,
      };
    } else if (event.RequestType === "Update") {
      const oldProps = event.OldResourceProperties as any as IndexSpec;
      const newProps = event.ResourceProperties as any as IndexSpec;

      if (oldProps.index !== newProps.index) {
        // name of index changed
        // TODO: should we use an alias, or create a new index and re-index?
        throw new Error(
          `changing the name of an index is not supported: ${oldProps.index} => ${newProps.index}`
        );
      }
      console.log(`Updating index ${newProps.index}`);
      if (newProps.settings) {
        await Promise.all([
          ifDiff(oldProps.settings, newProps.settings, async () => {
            console.log(`Updating settings ${newProps.index}`);
            await client.indices.putSettings<
              any,
              opensearchtypes.IndicesPutSettingsIndexSettingsBody
            >({
              index: newProps.index,
              body: {
                settings: newProps.settings,
              },
            });
            console.log(`Updated settings ${newProps.index}`);
          }),
          ifDiff(newProps.mappings, newProps.mappings, async () => {
            console.log(`Updating mappings ${newProps.index}`);
            await client.indices.putMapping({
              index: newProps.index,
              body: newProps.mappings!,
            });
            console.log(`Updated mappings ${newProps.index}`);
          }),
        ]);
      }
      return {
        IndexName: newProps.index,
      };
    } else {
      await client.indices.delete({
        index: event.PhysicalResourceId,
      });
      return {
        IndexName: event.PhysicalResourceId,
      };
    }
  }

  async function sendResult(
    result:
      | {
          status: "SUCCESS";
          physicalId: string;
          data: Record<string, any>;
        }
      | {
          status: "FAILED";
          physicalId?: string;
          reason: string;
        }
  ) {
    await retry({
      execute: async () => {
        const body = {
          LogicalResourceId: event.LogicalResourceId,
          PhysicalResourceId: result.physicalId ?? "NONE",
          Reason: result.status === "FAILED" ? result.reason : undefined,
          RequestId: event.RequestId,
          StackId: event.StackId,
          Status: result.status,
          Data: result.status === "SUCCESS" ? result.data : undefined,
        };
        console.log("Sending CFN Result", body);
        const response = await fetch(event.ResponseURL, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        console.log("Sent CFN Result", response);
        if (response.status !== 200) {
          console.log(`Failed to send CFN response`, response);
          throw new Error(`Failed to send CFN response`);
        }
      },
    });
  }
};

async function retry<T>({
  execute,
  initDelayMs = 100,
  maxAttempts = 10,
  attemptsRemaining = maxAttempts,
  maxDelayMs = 10000,
  delayMs = initDelayMs,
}: {
  delayMs?: number;
  initDelayMs?: number;
  attemptsRemaining?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  execute: () => Promise<T>;
}): Promise<T> {
  try {
    return await execute();
  } catch (err) {
    console.error(err);
    if (attemptsRemaining > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(maxDelayMs, delayMs))
      );
      return retry({
        execute,
        attemptsRemaining,
        delayMs: delayMs * 2,
        initDelayMs,
        maxAttempts,
        maxDelayMs,
      });
    } else {
      throw new Error(`Failed after max retry attempts`);
    }
  }
}

async function ifDiff<T>(
  a: any,
  b: any,
  then: () => Promise<T>
): Promise<T | void> {
  if (!isSame(a, b)) {
    return then();
  }
}

function isSame(a: any, b: any): boolean {
  if (typeof a !== typeof b) {
    return false;
  } else if (a === b) {
    return true;
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    } else {
      return a.every((aVal, i) => isSame(aVal, b[i]));
    }
  } else if (typeof a === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    } else {
      const aKeysSet = new Set(aKeys);
      for (const bKey of bKeys) {
        aKeysSet.delete(bKey);
      }
      if (aKeysSet.size !== 0) {
        return false;
      } else {
        return aKeys.every((aKey) => isSame(aKey, b[aKey]));
      }
    }
  } else {
    return false;
  }
}
