import fs from "fs/promises";
import { spawn } from "child_process";
import { PackageManager } from "./index";

export function isUsingYarn() {
  return isUsing("yarn");
}

// verified PNPM also sets it: https://github.com/pnpm/pnpm/pull/4317
export function isUsingPnpm() {
  return isUsing("pnpm");
}

function isUsing<P extends PackageManager>(packageManger: P) {
  // inspired by create-react-app: https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/create-react-app/createReactApp.js#L52
  return process.env.npm_config_user_agent?.startsWith(packageManger);
}

export function discoverPackageManager(): PackageManager {
  return isUsingYarn() ? "yarn" : isUsingPnpm() ? "pnpm" : "npm";
}

export async function exec(command: string, ...args: string[]) {
  console.log(process.cwd(), [command, ...args].join(" "));
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: "inherit",
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", () => resolve(undefined));
  });
}

export function addDeps(pkgManager: PackageManager, ...pkgs: string[]) {
  return _addDeps(pkgManager, false, ...pkgs);
}

export function addDevDeps(pkgManager: PackageManager, ...pkgs: string[]) {
  return _addDeps(pkgManager, true, ...pkgs);
}

export function _addDeps(
  pkgManager: PackageManager,
  isDev: boolean,
  ...pkgs: string[]
) {
  return exec(
    pkgManager,
    pkgManager === "npm" || pkgManager === "pnpm" ? "i" : "add",
    ...(pkgManager === "npm"
      ? isDev
        ? ["--save-dev"]
        : ["--save"]
      : pkgManager === "pnpm" || pkgManager === "yarn"
      ? isDev
        ? ["-D"]
        : []
      : []),
    ...pkgs
  );
}

export async function install(pkgManager: PackageManager) {
  if (pkgManager === "yarn") {
    await exec("yarn");
  } else {
    await exec(pkgManager, "i");
  }
}

export async function modifyTsConfig(
  file: string,
  transformations: Array<(tsConfig: any) => void>
) {
  const tsConfig = JSON.parse((await fs.readFile(file)).toString("utf-8"));
  tsConfig.compilerOptions ??= {};
  tsConfig.compilerOptions.lib ??= [];
  for (const t of transformations) {
    t(tsConfig);
  }
  await fs.writeFile(file, JSON.stringify(tsConfig, null, 2));
}

export async function addTsLib(tsConfig: any, ...libs: string[]) {
  const lib = tsConfig.compilerOptions.lib;
  for (const newLib of libs) {
    if (
      lib.find(
        (existingLib: string) =>
          existingLib.toLowerCase() === newLib.toLowerCase()
      ) === undefined
    ) {
      lib.push(newLib);
    }
  }
}

export async function overrideTsCompilerOptions(
  tsConfig: any,
  options: Record<string, string>
) {
  tsConfig.compilerOptions = { ...tsConfig.compilerOptions, ...options };
}

export interface CreateProps {
  projectName: string;
  pkgManager: PackageManager;
}
