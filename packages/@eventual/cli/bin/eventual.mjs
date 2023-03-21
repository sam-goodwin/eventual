#!/usr/bin/env ts-node-esm
import { cli } from "@eventual/cli/lib/esm/cli.js";

//Get rid of experimental fetch warning
process.removeAllListeners("warning");
process.env.NODE_ENV ??= "production";

cli.completion().parse();
