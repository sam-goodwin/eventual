import { exec } from "./exec";

export type PackageManager = "npm" | "yarn" | "pnpm";

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

export async function install(pkgManager: PackageManager) {
  if (pkgManager === "yarn") {
    await exec("yarn");
  } else {
    await exec(pkgManager, "i");
  }
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
