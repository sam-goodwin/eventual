import fs from "fs/promises";
import getStdin from "get-stdin";

/**
 * Get input json from specified file, otherwise stdin
 * @param inputFile file to read from
 * @returns parsed json. Will be empty object if no input was given
 */
export async function getInputJson(
  inputFile: string | undefined,
  input: string | undefined,
  inputFileFieldName = "inputFile",
  inputFieldName = "input"
): Promise<any> {
  if (inputFile && input) {
    throw new Error(
      `Must provide one or zero of ${inputFileFieldName} or ${inputFieldName}`
    );
  } else if (inputFile) {
    return JSON.parse(await fs.readFile(inputFile, { encoding: "utf-8" }));
  } else if (input) {
    return JSON.parse(input);
  } else {
    const stdin = await getStdin();
    return stdin.length === 0 ? {} : JSON.parse(stdin);
  }
}
