import { spawn } from "child_process";

/**
 * A simple wrapper of {@link spawn} to execute a script as a Promise
 * and pipe stdio.
 */
export async function exec(command: string, ...args: string[]) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    proc.on("error", (err) => reject(err));
    proc.on("exit", () => resolve(undefined));
  });
}
