import { buildService, BuildAWSRuntimeProps } from "./build";

export async function main() {
  try {
    const [, , request] = process.argv;
    if (!request) {
      throw new Error(`Usage: eventual-build <out-dir> <sources>`);
    }
    const requestPayload = JSON.parse(
      Buffer.from(request, "base64").toString("utf-8")
    ) as BuildAWSRuntimeProps;

    await buildService(requestPayload);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
