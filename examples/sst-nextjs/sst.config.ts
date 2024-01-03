import { SSTConfig } from "sst";
import { NextjsSite } from "sst/constructs";
import { Service } from "@eventual/sst";

import type * as Backend from "./src/server/index.js";

export default {
  config(_input) {
    return {
      name: "sst-nextjs",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function Site({ stack }) {
      const backend = new Service<typeof Backend>(stack, "service", {
        name: "backend",
        entry: "./src/server/index.ts",
      });

      const site = new NextjsSite(stack, "site", {
        bind: [backend],
        // environment: {
        //   SERVICE_URL: backend.gateway.apiEndpoint,
        // },
      });

      stack.addOutputs({
        SiteUrl: site.url,
        ServiceUrl: backend.gateway.apiEndpoint,
      });
    });
  },
} satisfies SSTConfig;
