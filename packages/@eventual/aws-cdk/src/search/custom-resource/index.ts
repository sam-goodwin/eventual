import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client, Connection } from "@opensearch-project/opensearch";
import { CloudFormationCustomResourceHandler } from "aws-lambda";
import aws4 from "aws4";
import {
  SearchIndexResourceAttributes,
  SearchIndexResourceProperties,
} from "../search-index";

const endpoint = process.env.OS_ENDPOINT;

let client: Client;

export const handle: CloudFormationCustomResourceHandler = async (event) => {
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
    await sendResult({
      status: "FAILED",
      reason: err.message,
    });
    console.error(err);
  }

  async function createUpdateOrDelete(): Promise<SearchIndexResourceAttributes> {
    if (event.RequestType === "Create") {
      const props =
        event.ResourceProperties as any as SearchIndexResourceProperties;
      await client.indices.create({
        index: props.index,
        body: props.body,
        cluster_manager_timeout: props.cluster_manager_timeout?.toString(10),
        error_trace: props.error_trace,
        filter_path: props.filter_path,
        human: props.human,
        pretty: props.pretty,
        wait_for_active_shards: props.wait_for_active_shards?.toString(10),
      });
      return {
        IndexName: props.index,
      };
    } else if (event.RequestType === "Update") {
      const oldProps =
        event.OldResourceProperties as any as SearchIndexResourceProperties;
      const newProps =
        event.ResourceProperties as any as SearchIndexResourceProperties;

      if (oldProps.index !== newProps.index) {
        // name of index changed
        // TODO: should we use an alias, or create a new index and re-index?
        throw new Error(`changing the name of an index is not supported`);
      }
      if (newProps.body?.settings) {
        await Promise.all([
          ifDiff(oldProps.body?.settings, newProps.body.settings, () =>
            client.indices.putSettings({
              index: newProps.index,
              body: {
                index: newProps.body!.settings,
              },
            })
          ),
          ifDiff(newProps.body.mappings, newProps.body.mappings, () =>
            client.indices.putMapping({
              index: newProps.index,
              body: newProps.body!.mappings!,
            })
          ),
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
      execute: () =>
        fetch(event.ResponseURL, {
          body: JSON.stringify({
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: result.physicalId ?? "NONE",
            Reason: result.status === "FAILED" ? result.reason : undefined,
            RequestId: event.RequestId,
            StackId: event.StackId,
            Status: result.status,
            Data: result.status === "SUCCESS" ? result.data : undefined,
          }),
        }),
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
