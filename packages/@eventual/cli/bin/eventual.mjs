#!/usr/bin/env node

import tsNode from "ts-node";

tsNode.register({
  esm: true,
});

import { cli } from "../lib/cli.js";

//Get rid of experimental fetch warning
process.removeAllListeners("warning");
process.env.NODE_ENV ??= "production";

cli.completion().parse();
