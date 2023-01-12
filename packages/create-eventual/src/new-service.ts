import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import { validateServiceName } from "./validate";
import { addTsReferences, updateJsonFile, writeJsonFile } from "./util";
import { version } from "./version";

export async function createNewService(serviceName?: string) {
  let eventualJsonFile: string;
  try {
    eventualJsonFile = (await fs.readFile("eventual.json")).toString("utf-8");
  } catch {
    console.error(
      "This is not a valid eventual project. You can only add a new service into an existing eventual project."
    );
    process.exit(1);
  }
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
    code: `import { api } from "@eventual/core"
            
api.get("/echo", async (request) => {
  return new Response(await request.text())
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
          "@eventual/core": `^${version}`,
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
