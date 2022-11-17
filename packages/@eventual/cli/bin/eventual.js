#!/usr/bin/env  node
import { cli } from "../lib/esm/cli.js";

//Get rid of experimental fetch warning
process.removeAllListeners("warning");

cli.parse();
