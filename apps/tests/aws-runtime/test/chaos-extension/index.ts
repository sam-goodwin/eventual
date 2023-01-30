#!/usr/bin/env node
import { createAwsSDKChaosPlugin } from "./aws-sdk-plugin.js";
import { chaosEngine } from "./extension-runtime.js";

export default createAwsSDKChaosPlugin(chaosEngine);
