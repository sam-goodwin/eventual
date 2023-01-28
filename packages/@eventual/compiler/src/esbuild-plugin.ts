import esBuild from "esbuild";
import { parseFile } from "@swc/core";
import { OuterVisitor } from "./workflow-visitor.js";
import { printModule } from "./print-module.js";

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
      return undefined;
    });
  },
};
