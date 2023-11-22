import { z } from "zod";
import { OpenAI } from "openai";
import { Task, task } from "./task.js";
import { registerEventualResource } from "./internal/resources.js";
import { workflow } from "./workflow.js";
import { ExecutionStatus } from "./execution.js";

export type AgentModel = OpenAI.Chat.ChatCompletionCreateParams["model"];

export type Peer = Agent;

export type AgentOptions = {
  /**
   * The {@link AgentModel} to use.
   *
   * @default gpt-4-1106-preview
   */
  model?: AgentModel;
  peers?: Peer[] | (() => Peer[]);
  /**
   * The description of the assistant. The maximum length is 512 characters.
   */
  description?: string;
  /**
   * Set of 16 key-value pairs that can be attached to an object.
   * This can be useful for storing additional information about
   * the object in a structured format. Keys can be a maximum of 64
   * characters long and values can be a maximum of 512 characters long.
   */
  metadata?: Record<string, string>;
  engagements?: string[];
  /**
   * The system instructions that the assistant uses. The maximum
   * length is 32768 characters.
   */
  instructions: string | string[];
  /**
   * A list of {@link Tool}s that the agent can invoke
   */
  tools?: Task[] | (() => Task[]);
  /**
   * Files to include in the Agent's scope.
   *
   * Providing a file will enable the "retrieval" tool.
   */
  files?: Record<string, string>;
  /**
   * Whether to enable Code Interpreter
   *
   * @default false
   */
  codeInterpreter?: boolean;
};

export type EngageRequest = {
  messages: Message[];
};

export type Agent<Name extends string = string> = {
  kind: "Agent";
  name: Name;
  options: AgentOptions;
  startEngagement(request: EngageRequest): Promise<Response>;
};

export type Message = OpenAI.ChatCompletionMessageParam;
export type Response = {
  engagementId: string;
};

export const engageAgent = workflow(`engageAgent`, async () => {
  //
});

export function agent<Name extends string>(
  name: Name,
  options: AgentOptions
): Agent<Name> {
  return registerEventualResource("Agent", {
    kind: "Agent",
    name,
    options,
    startEngagement: async (input) => {
      const { executionId: engagementId } = await engageAgent.startExecution({
        input,
      });
      return { engagementId };
    },
    checkEngagement: async (engagementId: string) => {
      const execution = await engageAgent.getExecution(engagementId);
      if (execution.status === ExecutionStatus.SUCCEEDED) {
        execution.result;
      }
    },
  });
}

const ai = new OpenAI();

const thread = await ai.beta.threads.create({
  messages: [],
});

async function go() {
  const run = await ai.beta.threads.runs.create(thread.id, {
    assistant_id: "asst_123",
  });

  if (run.status === "requires_action") {
    if (run.required_action) {
      run.required_action.submit_tool_outputs.tool_calls.map((call) => {
        //
        call.function.name;
        call.function.arguments;
      });
    }
  }
}

export const appealManager = agent("Appeal Manager", {
  instructions: ["You are a "],
  peers: () => [fileManager],
});

export const fileManager = agent("File Manager", {
  instructions: [
    "You are a customer service agent for a company that sells widgets.",
  ],
  tools: () => [createPDF],
});

export const createPDF = task(
  "createPDF",
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
