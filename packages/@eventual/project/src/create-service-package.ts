import fs from "fs/promises";
import { writeJsonFile } from "./json-file.js";
import path from "path";

export async function createServicePackage(
  serviceDir: string,
  props: {
    packageName: string;
    src: {
      [fileName: string]: string;
    };
    test?: {
      [fileName: string]: string;
    };
    dependencies?: Record<string, string>;
    references?: string[];
    eventualVersion: string;
  }
) {
  const cwd = process.cwd();
  await fs.mkdir(serviceDir, {
    recursive: true,
  });
  process.chdir(serviceDir);
  try {
    await Promise.all([
      writeJsonFile("package.json", {
        name: props.packageName,
        type: "module",
        main: "lib/index.js",
        module: "lib/index.js",
        types: "lib/index.d.ts",
        version: "0.0.0",
        scripts: {
          test: "jest --passWithNoTests",
        },
        dependencies: {
          "@eventual/core": `^${props.eventualVersion}`,
          ...props.dependencies,
        },
        devDependencies: {
          "@eventual/testing": `^${props.eventualVersion}`,
          esbuild: "^0.16.14",
          jest: "^29",
          "ts-jest": "^29",
          "ts-node": "^10.9.1",
          typescript: "^5",
        },
        jest: {
          extensionsToTreatAsEsm: [".ts"],
          moduleNameMapper: {
            "^(\\.{1,2}/.*)\\.js$": "$1",
          },
          transform: {
            "^.+\\.(t|j)sx?$": [
              "ts-jest",
              {
                tsconfig: "tsconfig.test.json",
                useESM: true,
              },
            ],
          },
        },
      }),
      writeJsonFile("tsconfig.json", {
        extends: "../../tsconfig.base.json",
        include: ["src"],
        references: props.references?.map((path) => ({ path })),
        compilerOptions: {
          lib: ["DOM"],
          outDir: "lib",
          rootDir: "src",
          target: "ES2021",
        },
      }),
      writeJsonFile("tsconfig.test.json", {
        extends: "./tsconfig.json",
        include: ["src", "test"],
        exclude: ["lib", "node_modules"],
        compilerOptions: {
          noEmit: true,
          rootDir: ".",
        },
      }),
      fs
        .mkdir("src")
        .then(() =>
          Promise.all(
            Object.entries(props.src).map(([file, code]) =>
              fs.writeFile(path.join("src", file), code)
            )
          )
        ),
      props.test
        ? fs
            .mkdir("test")
            .then(() =>
              Promise.all(
                Object.entries(props.test!).map(([file, code]) =>
                  fs.writeFile(path.join("test", file), code!)
                )
              )
            )
        : Promise.resolve(undefined),
    ]);
  } finally {
    process.chdir(cwd);
  }
}
