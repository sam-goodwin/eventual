import {
  addTsReferences,
  createServicePackage,
  discoverEventualConfig,
  discoverEventualVersion,
  updateJsonFile,
  validateServiceName,
} from "@eventual/project";
import inquirer from "inquirer";
import path from "path";

/**
 * Creates a new Service in an Eventual-managed project.
 */
export async function createNewService(serviceName?: string) {
  const eventualJsonFile = await discoverEventualConfig(process.cwd());
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
    src: {
      "index.ts": `import { api, HttpResponse } from "@eventual/core";
            
api.get("/echo", async (request) => {
  return new HttpResponse(await request.text());
});
`,
    },
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
