import { readFileSync } from "fs";
import path from "path";

let dirname: string;
if (typeof __dirname === "undefined") {
  dirname = path.dirname(new URL(import.meta.url).pathname);
} else {
  dirname = __dirname;
}

export function readSample(name: string) {
  return readFileSync(path.join(dirname, "samples", `${name}.ts`), "utf-8");
}
