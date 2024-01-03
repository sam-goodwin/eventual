import esbuild from "esbuild";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

test("esbuild for web", async () => {
  await esbuild.build({
    outfile: "/dev/null",
    bundle: true,
    target: "es2022",
    platform: "browser",
    // nextjs was not throwing on this, but the local test was, try to ignore it for now.
    external: ["https"],
    nodePaths: [path.join(__dirname, "../../..")],
    stdin: {
      contents: `import {HttpEventualClient} from "@eventual/client";
new HttpEventualClient();`,
      loader: "ts",
      resolveDir: __dirname,
    },
  });
});

test("esbuild for node", async () => {
  await esbuild.build({
    outfile: "/dev/null",
    bundle: true,
    target: "es2022",
    platform: "node",
    nodePaths: [path.join(__dirname, "../../..")],
    stdin: {
      contents: `import {HttpEventualClient} from "@eventual/client";
new HttpEventualClient();`,
      loader: "ts",
      resolveDir: __dirname,
    },
  });
});
