import {
  ExecutionAlreadyExists,
  ExecutionStatus,
  hashCode,
  InProgressExecution,
  INTERNAL_EXECUTION_ID_PREFIX,
  workflow,
} from "@eventual/core";
import { jest } from "@jest/globals";
import { LogsClient } from "../src/clients/logs-client.js";
import { WorkflowClient } from "../src/clients/workflow-client.js";
import { WorkflowSpecProvider } from "../src/providers/workflow-provider.js";
import { ExecutionStore } from "../src/stores/execution-store.js";

const mockExecutionStore = {
  create: jest.fn() as ExecutionStore["create"],
  get: jest.fn() as ExecutionStore["get"],
  update: jest.fn() as ExecutionStore["update"],
} as ExecutionStore;
const mockLogClient = {
  initializeExecutionLog: jest.fn() as LogsClient["initializeExecutionLog"],
  putExecutionLogs: jest.fn() as LogsClient["putExecutionLogs"],
} as LogsClient;
const mockWorkflowProvider = {
  workflowExists: jest.fn() as WorkflowSpecProvider["workflowExists"],
} as WorkflowSpecProvider;

const testDate = new Date();

const underTest = new WorkflowClient(
  mockExecutionStore,
  mockLogClient,
  mockWorkflowProvider,
  () => testDate
);

const myWF = workflow("myWorkflow", async () => {
  return "hi";
});

beforeEach(() => {
  jest.mocked(mockWorkflowProvider.workflowExists).mockReturnValue(true);
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
    jest.mocked(mockWorkflowProvider.workflowExists).mockReturnValue(false);

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
    jest.mocked(mockWorkflowProvider.workflowExists).mockReturnValue(false);

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
      parentExecutionId: "someParent/",
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
});

describe("succeed execution", () => {
  test("happy path", async () => {
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      parent: undefined,
    } as Partial<InProgressExecution> as InProgressExecution);

    await underTest.succeedExecution({
      executionId: "",
      result: undefined,
      endTime: "",
    });

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      expect.anything(),
      undefined
    );
  });

  test("happy path with parent", async () => {
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      parent: { executionId: "/", seq: 0 },
    } as Partial<InProgressExecution> as InProgressExecution);

    await underTest.succeedExecution({
      executionId: "",
      result: undefined,
      endTime: "",
    });

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything()
    );
  });
});

describe("fail execution", () => {
  test("happy path", async () => {
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      parent: undefined,
    } as Partial<InProgressExecution> as InProgressExecution);

    await underTest.failExecution({
      executionId: "",
      error: "",
      message: "",
      endTime: "",
    });

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      expect.anything(),
      undefined
    );
  });

  test("happy path with parent", async () => {
    jest.mocked(mockExecutionStore.get).mockResolvedValue({
      parent: { executionId: "/", seq: 0 },
    } as Partial<InProgressExecution> as InProgressExecution);

    await underTest.failExecution({
      executionId: "",
      error: "",
      message: "",
      endTime: "",
    });

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything()
    );
  });
});
