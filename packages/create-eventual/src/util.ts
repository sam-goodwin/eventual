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
