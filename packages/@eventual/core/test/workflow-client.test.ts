import { jest } from "@jest/globals";
import { ExecutionAlreadyExists } from "../src/error.js";
import {
  ExecutionStatus,
  FailedExecution,
  hashCode,
  SucceededExecution,
} from "../src/index.js";
import { ExecutionQueueClient } from "../src/runtime/clients/execution-queue-client.js";
import { LogsClient } from "../src/runtime/clients/logs-client.js";

import { WorkflowClient } from "../src/runtime/clients/workflow-client.js";
import { INTERNAL_EXECUTION_ID_PREFIX } from "../src/runtime/execution-id.js";
import { WorkflowProvider } from "../src/runtime/providers/workflow-provider.js";
import { ExecutionStore } from "../src/runtime/stores/execution-store.js";
import { workflow } from "../src/workflow.js";

const mockExecutionStore = {
  create: jest.fn() as ExecutionStore["create"],
  get: jest.fn() as ExecutionStore["get"],
  update: jest.fn() as ExecutionStore["update"],
} as ExecutionStore;
const mockLogClient = {
  initializeExecutionLog: jest.fn() as LogsClient["initializeExecutionLog"],
  putExecutionLogs: jest.fn() as LogsClient["putExecutionLogs"],
} as LogsClient;
const mockExecutionQueueClient = {
  submitExecutionEvents:
    jest.fn() as ExecutionQueueClient["submitExecutionEvents"],
} as ExecutionQueueClient;
const mockWorkflowProvider: WorkflowProvider = {
  lookupWorkflow: jest.fn<WorkflowProvider["lookupWorkflow"]>(),
} as WorkflowProvider;

const testDate = new Date();

const underTest = new WorkflowClient(
  mockExecutionStore,
  mockLogClient,
  mockExecutionQueueClient,
  mockWorkflowProvider,
  () => testDate
);

const myWF = workflow("myWorkflow", async () => {
  return "hi";
});

beforeEach(() => {
  jest.mocked(mockWorkflowProvider.lookupWorkflow).mockReturnValue(myWF);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("start execution", () => {
  test("happy path", async () => {
    const { executionId, alreadyRunning } = await underTest.startExecution({
      input: undefined,
      workflow: "myWorkflow",
      executionName: "myexecution",
    });

    expect(executionId).toEqual("myWorkflow/myexecution");
    expect(alreadyRunning).toBeFalsy();
  });

  test("workflow does not exist", async () => {
    jest.mocked(mockWorkflowProvider.lookupWorkflow).mockReturnValue(undefined);

    expect(() =>
      underTest.startExecution({
        input: undefined,
        workflow: "myWorkflow",
        executionName: "myexecution",
      })
    ).rejects.toThrowError(
      `Workflow myWorkflow does not exist in the service.`
    );
  });

  test("workflow is object", async () => {
    jest.mocked(mockWorkflowProvider.lookupWorkflow).mockReturnValue(undefined);

    const { alreadyRunning, executionId } = await underTest.startExecution({
      input: undefined,
      workflow: myWF,
      executionName: "myexecution",
    });

    expect(executionId).toEqual("myWorkflow/myexecution");
    expect(alreadyRunning).toBeFalsy();
  });

  test("without execution name", async () => {
    const { executionId, alreadyRunning } = await underTest.startExecution({
      input: undefined,
      workflow: "myWorkflow",
    });

    expect(executionId).toEqual(expect.stringMatching(/^myWorkflow\/.*/g));
    expect(alreadyRunning).toBeFalsy();
  });

  test("execution name is invalid non child", async () => {
    expect(() =>
      underTest.startExecution({
        input: undefined,
        workflow: "myWorkflow",
        executionName: "%badName",
      })
    ).rejects.toThrowError(
      `Execution names may not start with ${INTERNAL_EXECUTION_ID_PREFIX}`
    );
  });

  test("execution name is valid child", async () => {
    const { executionId, alreadyRunning } = await underTest.startExecution({
      input: undefined,
      workflow: "myWorkflow",
      executionName: "%child",
      parentExecutionId: "someParent",
      seq: 0,
    });

    expect(executionId).toEqual(`myWorkflow/%child`);
    expect(alreadyRunning).toBeFalsy();
  });

  test("execution name already started", async () => {
    jest
      .mocked(mockExecutionStore.create)
      .mockRejectedValue(new ExecutionAlreadyExists("", ""));
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      id: "myWorkflow/myExecution",
      startTime: "",
      workflowName: "myWorkflow",
      inputHash: undefined,
      status: ExecutionStatus.IN_PROGRESS,
    });

    const { alreadyRunning } = await underTest.startExecution({
      input: undefined,
      workflow: "myWorkflow",
      executionName: "myExecution",
    });

    expect(alreadyRunning).toBeTruthy();
  });

  test("execution name already started with input", async () => {
    jest
      .mocked(mockExecutionStore.create)
      .mockRejectedValue(new ExecutionAlreadyExists("", ""));
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      id: "myWorkflow/myExecution",
      startTime: "",
      workflowName: "myWorkflow",
      inputHash: hashCode(JSON.stringify({ value: "hello" })).toString(16),
      status: ExecutionStatus.IN_PROGRESS,
    });

    const { alreadyRunning } = await underTest.startExecution({
      input: { value: "hello" },
      workflow: "myWorkflow",
      executionName: "myExecution",
    });

    expect(alreadyRunning).toBeTruthy();
  });

  test("execution name collision", async () => {
    jest
      .mocked(mockExecutionStore.create)
      .mockRejectedValue(
        new ExecutionAlreadyExists("myWorkflow", "myExecution")
      );
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      id: "myWorkflow/myExecution",
      startTime: "",
      workflowName: "myWorkflow",
      inputHash: hashCode(JSON.stringify({ value: "hello" })).toString(16),
      status: ExecutionStatus.IN_PROGRESS,
    });

    expect(() =>
      underTest.startExecution({
        input: { value: "hello again" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError(
      "Execution name myWorkflow already exists for workflow myExecution with different inputs."
    );
  });

  test("execution name collision with input", async () => {
    jest
      .mocked(mockExecutionStore.create)
      .mockRejectedValue(
        new ExecutionAlreadyExists("myWorkflow", "myExecution")
      );
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      id: "myWorkflow/myExecution",
      startTime: "",
      workflowName: "myWorkflow",
      inputHash: undefined,
      status: ExecutionStatus.IN_PROGRESS,
    });

    expect(() =>
      underTest.startExecution({
        input: { value: "hello" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError(
      "Execution name myWorkflow already exists for workflow myExecution with different inputs."
    );
  });

  test("create fails non-collision error", async () => {
    jest
      .mocked(mockExecutionStore.create)
      .mockRejectedValue(new Error("Some Error"));

    expect(() =>
      underTest.startExecution({
        input: { value: "hello" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError("Some Error");
  });

  test("create log stream fails", async () => {
    jest
      .mocked(mockLogClient.initializeExecutionLog)
      .mockRejectedValue(new Error("Some Error"));

    expect(() =>
      underTest.startExecution({
        input: { value: "hello" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError("Some Error");
  });

  test("write log stream fails", async () => {
    jest
      .mocked(mockLogClient.putExecutionLogs)
      .mockRejectedValue(new Error("Some Error"));

    expect(() =>
      underTest.startExecution({
        input: { value: "hello" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError("Some Error");
  });

  test("submit to queue fails", async () => {
    jest
      .mocked(mockExecutionQueueClient.submitExecutionEvents)
      .mockRejectedValue(new Error("Some Error"));

    expect(() =>
      underTest.startExecution({
        input: { value: "hello" },
        workflow: "myWorkflow",
        executionName: "myExecution",
      })
    ).rejects.toThrowError("Some Error");
  });
});

describe("succeed execution", () => {
  test("happy path", async () => {
    jest.mocked(mockExecutionStore.update).mockResolvedValue({
      parent: undefined,
    } as Partial<SucceededExecution> as SucceededExecution);

    await underTest.succeedExecution({
      executionId: "",
      result: undefined,
    });

    expect(
      mockExecutionQueueClient.submitExecutionEvents
    ).not.toHaveBeenCalled();
  });

  test("happy path with parent", async () => {
    jest.mocked(mockExecutionStore.update).mockResolvedValue({
      parent: { executionId: "", seq: 0 },
    } as Partial<SucceededExecution> as SucceededExecution);

    await underTest.succeedExecution({
      executionId: "",
      result: undefined,
    });

    expect(mockExecutionQueueClient.submitExecutionEvents).toHaveBeenCalled();
  });
});

describe("fail execution", () => {
  test("happy path", async () => {
    jest.mocked(mockExecutionStore.update).mockResolvedValue({
      parent: undefined,
    } as Partial<FailedExecution> as FailedExecution);

    await underTest.failExecution({
      executionId: "",
      error: "",
      message: "",
    });

    expect(
      mockExecutionQueueClient.submitExecutionEvents
    ).not.toHaveBeenCalled();
  });

  test("happy path with parent", async () => {
    jest.mocked(mockExecutionStore.update).mockResolvedValue({
      parent: { executionId: "", seq: 0 },
    } as Partial<FailedExecution> as FailedExecution);

    await underTest.failExecution({
      executionId: "",
      error: "",
      message: "",
    });

    expect(mockExecutionQueueClient.submitExecutionEvents).toHaveBeenCalled();
  });
});
