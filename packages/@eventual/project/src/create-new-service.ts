import path from "path";
import { createServicePackage } from "./create-service-package.js";
import { discoverEventualConfig } from "./eventual-manifest.js";
import { updateJsonFile } from "./json-file.js";
import { addTsReferences } from "./tsconfig-file.js";
import { discoverEventualVersion } from "./version.js";

/**
 * Creates a new Service in an Eventual-managed project.
 */
export async function createNewService(serviceName: string) {
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
