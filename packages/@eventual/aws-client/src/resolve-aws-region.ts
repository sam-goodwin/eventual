import {
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS,
} from "@aws-sdk/config-resolver";
import { loadConfig } from "@aws-sdk/node-config-provider";

export async function resolveRegion() {
  return await loadConfig(
    NODE_REGION_CONFIG_OPTIONS,
    NODE_REGION_CONFIG_FILE_OPTIONS
  )();
}
