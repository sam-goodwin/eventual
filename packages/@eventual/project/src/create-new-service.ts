import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import { validateServiceName } from "./validate.js";
import { addTsReferences } from "./tsconfig-file.js";
import { updateJsonFile, writeJsonFile } from "./json-file.js";
import { discoverEventualManifest } from "./eventual-manifest.js";
import { discoverEventualVersion } from "./version.js";

/**
 * Creates a new Service in an Eventual-managed project.
 */
export async function createNewService(serviceName?: string) {
  const eventualJsonFile = await discoverEventualManifest(process.cwd());
  if (eventualJsonFile === undefined) {
    console.error(
      "This is not a valid eventual project. You can only add a new service into an existing eventual project."
    );
    process.exit(1);
  }
  const eventualVersion = await discoverEventualVersion();

  // @ts-ignore
  const eventualJson = JSON.parse(eventualJsonFile);

  if (!serviceName) {
    serviceName = (
      await inquirer.prompt([
        {
          type: "input",
          name: "serviceName",
          when: !serviceName,
          message: `service name`,
          validate: validateServiceName,
        },
      ])
    ).serviceName! as string;
  }

  await createServicePackage(path.resolve(process.cwd(), "apps", serviceName), {
    packageName: serviceName,
    eventualVersion,
    code: `import { api } from "@eventual/core"
            
api.get("/echo", async (request) => {
  return new Response(await request.text());
});
`,
  });

  await Promise.all([
    addTsReferences("tsconfig.json", [`apps/${serviceName}`]),

    updateJsonFile(
      path.join("infra", "package.json"),
      (pkgJson) => (pkgJson.dependencies[serviceName!] = "*")
    ),

    addTsReferences(path.join("infra", "tsconfig.json"), [
      `../apps/${serviceName}`,
    ]),
  ]);
}

export async function createServicePackage(
  serviceDir: string,
  props: {
    packageName: string;
    code: string;
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
        dependencies: {
          "@eventual/core": `^${props.eventualVersion}`,
          ...props.dependencies,
        },
      }),
      writeJsonFile("tsconfig.json", {
        extends: "../../tsconfig.base.json",
        include: ["src"],
        references: props.references?.map((path) => ({ path })),
        compilerOptions: {
          lib: ["DOM"],
          module: "esnext",
          moduleResolution: "NodeNext",
          outDir: "lib",
          rootDir: "src",
          target: "ES2021",
        },
      }),
      fs
        .mkdir("src")
        .then(() => fs.writeFile(path.join("src", "index.ts"), props.code)),
    ]);
  } finally {
    process.chdir(cwd);
  }
}
