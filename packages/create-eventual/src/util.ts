import fs from "fs/promises";
import { spawn } from "child_process";
import { PackageManager } from "./index";

export async function exec(command: string, ...args: string[]) {
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

export async function addTsLib(file: string, ...libs: string[]) {
  const tsConfig = JSON.parse((await fs.readFile(file)).toString("utf-8"));
  tsConfig.compilerOptions ??= {};
  const lib: string[] = (tsConfig.lib ??= []);
  for (const newLib of libs) {
    if (
      lib.find(
        (existingLib) => existingLib.toLowerCase() === newLib.toLowerCase()
      ) !== undefined
    ) {
      lib.push(newLib);
    }
  }
  await fs.writeFile(file, JSON.stringify(tsConfig, null, 2));
}
