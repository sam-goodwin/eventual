import esBuild from "esbuild";
import { Module, parseFile, print } from "@swc/core";
import path from "path";
import { OuterVisitor } from "./workflow-visitor.js";

export const eventualESPlugin: esBuild.Plugin = {
  name: "eventual",
  setup(build) {
    build.onLoad({ filter: /\.[mc]?[tj]s$/g }, async (args) => {
      // FYI: SWC erases comments: https://github.com/swc-project/swc/issues/6403
      const sourceModule = await parseFile(args.path, {
        syntax: "typescript",
      });

      const outerVisitor = new OuterVisitor();
      const transformedModule = outerVisitor.visitModule(sourceModule);

      // only format the module and return it if we found eventual functions to transform.
      if (outerVisitor.foundEventual) {
        const { code } = await printModule(transformedModule, args.path);

        return {
          contents: code,
          loader: "ts",
        };
      }
      return;
    });
  },
};

async function printModule(module: Module, filePath: string) {
  return await print(module, {
    //sourceFileName doesnt set up the sourcemap path the same way as transform does...
    sourceFileName: path.basename(filePath),
    //Instead these two are needed
    filename: path.basename(filePath),
    outputPath: path.dirname(filePath),
    //esbuild will extract these out later
    sourceMaps: "inline",
    jsc: {
      target: "es2022",
    },
  });
}
