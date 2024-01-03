import { createRequire } from "module";

const require = createRequire(import.meta.url);

export function findBuildCLI() {
  return require.resolve("./build-cli.js");
}
