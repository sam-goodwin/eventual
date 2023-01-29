#!/usr/bin/env -S node -r "ts-node/register"

const { infer } = require("../lib/cjs/eventual-infer.js");

infer();
