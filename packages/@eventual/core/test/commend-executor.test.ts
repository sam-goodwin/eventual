import { CommandType } from "../src/command.js";
import { SleepScheduled, WorkflowEventType } from "../src/events.js";
import { WorkflowClient, WorkflowRuntimeClient } from "../src/index.js";
import { TimerClient } from "../src/runtime/clients/timer-client.js";
import { CommandExecutor } from "../src/runtime/command-executor.js";
import { Workflow } from "../src/workflow.js";

const mockTimerClient = {
  startTimer: jest.fn() as TimerClient["startTimer"],
} satisfies Partial<TimerClient> as TimerClient;
const mockWorkflowClient =
  {} satisfies Partial<WorkflowClient> as WorkflowClient;
const mockWorkflowRuntimeClient =
  {} satisfies Partial<WorkflowRuntimeClient> as WorkflowRuntimeClient;

const testExecutor = new CommandExecutor({
  timerClient: mockTimerClient,
  workflowClient: mockWorkflowClient,
  workflowRuntimeClient: mockWorkflowRuntimeClient,
});

const workflow = {
  workflowName: "myWorkflow",
} satisfies Partial<Workflow> as Workflow;
const executionId = "execId";

const baseTime = new Date();

describe("sleep", () => {
  test("sleep for", async () => {
    const event = await testExecutor.executeCommand(
      workflow,
      executionId,
      {
        kind: CommandType.SleepFor,
        durationSeconds: 10,
        seq: 0,
      },
      baseTime
    );

    expect(event).toMatchObject<SleepScheduled>({
      seq: 0,
      timestamp: expect.stringContaining("Z"),
      type: WorkflowEventType.SleepScheduled,
      untilTime: new Date(baseTime.getTime() + 10 * 1000).toISOString(),
    });
  });
});
