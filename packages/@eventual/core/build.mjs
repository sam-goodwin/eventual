import "zx/globals";

await $`tsc -b`;
const packageJson = JSON.parse(await fs.readFile("./package.json"));
packageJson.type = "module";
packageJson.exports["."].import = "./index.js";
(packageJson.main = "./index.js"),
  await fs.writeJSON("./lib/esm/package.json", packageJson, { spaces: 2 });
