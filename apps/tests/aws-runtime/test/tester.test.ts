import { workflowClient } from "./client-create.js";
import "./test-service.js";
import { tests } from "./runtime-test-harness.js";

jest.setTimeout(100 * 1000);

tests.forEach((_test) => {
  test(_test.name, async () => {
    const executionId = await workflowClient.startWorkflow({
      workflowName: _test.workflow.workflowName,
      input: _test.input,
    });

    await _test.test(executionId);
  });
});
