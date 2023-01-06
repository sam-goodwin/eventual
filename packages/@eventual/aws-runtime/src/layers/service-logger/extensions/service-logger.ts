#!/usr/bin/env node
import { exec } from "child_process";
console.log("[extension:node] launching service-logger");
exec(`opts/service-logger/index.js`);
