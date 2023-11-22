// @ts-nocheck
import { z } from "zod";
import { agent, task } from "@eventual/core";

export const appealManager = agent("Appeal Manager", {
  instructions: ["You are a "],
  peers: () => [
    //
    fileManager,
  ],
});

export const fileManager = agent("File Manager", {
  instructions: [
    "You are a customer service agent for a company that sells widgets.",
  ],
  tools: () => ({
    createPDF,
  }),
});

export const createPDF = task(
  {
    description: "Creates",
    input: {
      fileID: z.string().describe("The ID of the PDF file to convert to PDF"),
      fields: z.record(z.string()).describe("Field values to pass to the PDF"),
    },
  },
  async ({ fileID }) => {
    //
    fileID;
  }
);
