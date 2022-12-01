import { createWorkflowClient } from "@eventual/aws-runtime";
import { queueUrl, tableName } from "./env.js";
import * as testService from "./test-service.js";

const workflowClient = createWorkflowClient({
  tableName: tableName(),
  workflowQueueUrl: queueUrl(),
});

const tests = testService.tests;

jest.setTimeout(100 * 1000);

tests.forEach((_test) => {
  test(test.name, async () => {
    const executionId = await workflowClient.startWorkflow({
      workflowName: _test.workflow.workflowName,
      input: _test.input,
    });

    await _test.test(executionId);
  });
});
