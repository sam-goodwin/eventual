import { spawn } from "child_process";

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
