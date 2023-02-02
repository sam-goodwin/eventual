import { Module, print } from "@swc/core";
import path from "path";

export async function printModule(module: Module, filePath: string) {
  return await print(module, {
    // sourceFileName doesnt set up the sourcemap path the same way as transform does...
    sourceFileName: path.basename(filePath),
    // Instead these two are needed
    filename: path.basename(filePath),
    outputPath: path.dirname(filePath),
    // esbuild will extract these out later
    sourceMaps: "inline",
    jsc: {
      target: "es2022",
    },
  });
}
